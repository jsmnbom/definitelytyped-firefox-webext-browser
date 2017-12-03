const fs = require("fs");
const path = require("path");
const stripJsonComments = require("strip-json-comments");
const _ = require("lodash");

// Reserved keywords in typescript
const RESERVED = ["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
    "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null",
    "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with"];

// Types that are considered "simple"
const SIMPLE_TYPES = ['string', 'integer', 'number', 'boolean', 'any'];

class Converter {
    constructor(folders, header, namespace_aliases) {
        // Generated source
        this.out = header;

        this.namespace_aliases = namespace_aliases;

        // Collect schema files
        this.schemaData = [];
        this.collectSchemas(folders);

        // Convert from split schemas to namespace
        // This merges all the properties that we care about for each namespace
        // Needed since many schema files add to the "manifest" namespace
        this.namespaces = {};
        for (let data of this.schemaData) {
            // Enumerate the actual namespace data
            for (let namespace of data[1]) {
                // Check if we have an alias for it
                if (this.namespace_aliases.hasOwnProperty(namespace.namespace)) {
                    namespace.namespace = this.namespace_aliases[namespace.namespace];
                }

                // If we haven't seen this namespace before, init it
                if (!this.namespaces.hasOwnProperty(namespace.namespace)) {
                    this.namespaces[namespace.namespace] = {
                        namespace: namespace.namespace,
                        types: [],
                        properties: {},
                        functions: [],
                        events: []
                    };
                }
                // Concat or extend namespace
                if (namespace.types) this.namespaces[namespace.namespace].types = this.namespaces[namespace.namespace].types.concat(namespace.types);
                if (namespace.properties) this.namespaces[namespace.namespace].properties = Object.assign(this.namespaces[namespace.namespace].properties, namespace.properties);
                if (namespace.functions) this.namespaces[namespace.namespace].functions = this.namespaces[namespace.namespace].functions.concat(namespace.functions);
                if (namespace.events) this.namespaces[namespace.namespace].events = this.namespaces[namespace.namespace].events.concat(namespace.events);

                if (namespace['$import']) this.namespaces[namespace.namespace]['$import'] = namespace['$import']
            }
        }
    }

    convert() {
        // For each namespace, set it as current, and convert it, which adds directly onto this.out
        for (let namespace of Object.keys(this.namespaces)) {
            this.namespace = namespace;
            this.convertNamespace();
        }
    }

    collectSchemas(folders) {
        // For each schema file
        for (let folder of folders) {
            const files = fs.readdirSync(folder);
            for (let file of files) {
                if (path.extname(file) === '.json') {
                    // Strip json comments, parse and add to data array
                    this.schemaData.push([file, JSON.parse(stripJsonComments(String(fs.readFileSync(path.join(folder, file)))))]);
                }
            }
        }
    }

    // noinspection JSMethodCanBeStatic
    convertPrimitive(type) {
        if (type === 'integer') {
            return 'number'
        }
        return type;
    }

    convertClass(type) {
        // Convert each property, function and event of a class
        let out = `{\n`;
        let convertedProperties = this.convertObjectProperties(type);
        if (type.functions) for (let func of type.functions) {
            convertedProperties.push(this.convertFunction(func, true, true, true));
        }
        if (type.events) for (let event of type.events) {
            convertedProperties.push(this.convertEvent(event, true));
        }
        out += `${convertedProperties.join(';\n') + ';'}`;
        out += `\n}`;

        return out;
    }

    convertObjectProperties(type) {
        let convertedProperties = [];
        // For each simple property
        if (type.properties) {
            for (let name of Object.keys(type.properties)) {
                let propertyType = type.properties[name];
                // Make sure it has a proper id by adding parent id to id
                propertyType.id = type.id + (name === 'properties' ? '' : ('_' + name));
                // Output property type (adding a ? if optional)
                convertedProperties.push(`${name}${type.properties[name].optional ? '?' : ''}: ${this.convertType(propertyType)}`);
            }
        }
        // For each pattern property
        if (type.patternProperties) {
            for (let name of Object.keys(type.patternProperties)) {
                // Assume it's a string type
                let keyType = 'string';
                // TODO: Simple regex check, probably flawed
                // If the regex has a \d and not a a-z, assume it's asking for a number
                if (name.includes('\\d') && !name.includes('a-z')) keyType = 'number';
                // Add the keyed property
                convertedProperties.push(`[key: ${keyType}]: ${this.convertType(type.patternProperties[name])}`);
            }
        }
        return convertedProperties;
    }

    convertRef(ref) {
        // Get the namespace of the reference, if any
        let namespace = ref.split('.')[0];
        // Do we have an alias for that namesapce?
        if (this.namespace_aliases.hasOwnProperty(namespace)) {
            // Revolve namespace aliases
            namespace = this.namespace_aliases[namespace];
            ref = `${namespace}.${ref.split('.')[1]}`
        }
        // The namespace is unnecessary if it's the current one
        if (namespace === this.namespace) {
            ref = ref.split('.')[1];
        }
        // If we know about the namespace
        if (Object.keys(this.namespaces).includes(namespace)) {
            // Add browser. to the front
            // Okay, apparently typescript doesn't need that, as all the namepaces are combined by the compiler
            //out += 'browser.';
        } else if (!this.namespaces[this.namespace].types.find(x => x.id === ref)) {
            console.log(`Warning: Cannot find reference "${ref}", assuming the browser knows better.`);
            // Add a type X = any, so the type can be used, but won't be typechecked
            this.additionalTypes.push(`type ${ref} = any;`);
        }
        return ref;
    }

    // noinspection JSMethodCanBeStatic
    convertEnumName(name) {
        // Convert from snake_case to PascalCase
        return name.split('_').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
    }

    convertType(type, root = false) {
        let out = '';
        // Check type of type
        if (type.choices) {
            // Okay so it's a choice between several types, we need to check
            // if choices include enums, and if so combine them
            let choices = [];
            let enums = [];
            for (let choice of type.choices) {
                if (choice.enum) {
                    enums = enums.concat(choice.enum);
                } else {
                    choices.push(choice)
                }
            }
            // If we found enums, output it as a single choice
            if (enums.length > 0) choices.push({
                id: type.id,
                enum: enums
            });
            // For each choice, convert according to rules, join via a pipe "|" and add to output
            out += _.uniqWith(choices.map(x => {
                // Override id with parent id for proper naming
                x.id = type.id;
                // Convert it as a type
                let y = this.convertType(x);
                // If it's any, make it object instead and hope that works
                // This is due to how "string | any" === "any" and the whole choice would therefore be redundant
                if (y === 'any') y = 'object';
                return y;
            }), _.isEqual).join(' | ');
        } else if (type.enum) {
            // If it's an enum
            // Make sure it has a proper id
            if (type.name && !type.id) type.id = type.name;
            // We can only output enums in the namespace root (a schema enum, instead of e.g. a property having an enum as type)
            if (root) {
                // So if we are in the root
                // Add each enum value, sanitizing the name (if it has one, otherwise just using its value as name)
                out += `{\n${type.enum.map(x => `${(x.name ? x.name : x).replace(/\W/g, '')} = "${x.name ? x.name : x}"`).join(',\n')}\n}`
            } else {
                // If we're not in the root, add the enum as an additional type instead, adding an _ in front of the name
                // We convert the actual enum based on rules above by passing through the whole type code again, but this time as root
                this.additionalTypes.push(`enum _${this.convertEnumName(type.id)} ${this.convertType(type, true)}`);
                // And then just reference it by name in output
                out += '_' + this.convertEnumName(type.id);
            }
        } else if (type.type) {
            // The type has an actual type, check it
            if (type.type === 'object') {
                // It's an object, how is the object constructed?
                if (type.functions || type.events) {
                    // It has functions or events, treat it as a claas
                    out += this.convertClass(type);
                } else if (type.properties || type.patternProperties) {
                    // It has properties, convert those
                    let properties = this.convertObjectProperties(type);
                    // If it has no properties, just say it's some type of object
                    if (properties.length > 0) {
                        out += `{\n${properties.join(';\n')};\n}`;
                    } else {
                        out += 'object';
                    }
                } else if (type.isInstanceOf) {
                    // It's an instance of another type
                    if (type.additionalProperties && type.additionalProperties.type === 'any') {
                        // The schemas write set additionalProperties.type = 'any' when typechecking can be anything
                        // This usually means it's "window" included as part of DOM
                        if (type.isInstanceOf.toLowerCase() === 'window') {
                            out += type.isInstanceOf;
                        } else {
                            // Otherwise it's some object we don't know about, therefore just treat it as a random object
                            out += `object/*${type.isInstanceOf}*/`;
                        }
                    } else {
                        // If the schema does not do that, try converting as a reference
                        out += this.convertRef(type.isInstanceOf);
                    }
                } else if (type.additionalProperties) {
                    // If it has additional, but not normal properties, try converting those properties as a type, passing the parent name
                    type.additionalProperties.id = type.id;
                    out += this.convertType(type.additionalProperties);
                } else {
                    // Okay so it's just some kind of object, right?...
                    out += 'object';
                }
            } else if (type.type === 'array') {
                // It's an array
                // Does it specify a fixed amount of items?
                if (type.minItems && type.maxItems && type.minItems === type.maxItems) {
                    // Yes, fixed amount of items, output it as an array literal
                    out += `[${new Array(type.minItems).fill(this.convertType(type.items)).join(', ')}]`
                } else if (type.items) {
                    // Figure out the array type, passing parent name
                    type.items.id = type.id;
                    let arrayType = this.convertType(type.items);
                    // Very bad check to see if it's a "simple" type in array terms
                    // This just checks if it's an enum or object, really
                    // TODO: Could probably be done better
                    if (arrayType.includes('\n') || arrayType.includes(';') || arrayType.includes(',')) {
                        // If it's not simple, use the Array<type> syntax
                        out += `Array<${arrayType}>`;
                    } else {
                        // If it is simple use type[] syntax
                        out += `${arrayType}[]`;
                    }
                }
            } else if (type.type === 'function') {
                // It's a function
                // Convert it as an array function
                out += this.convertFunction(type, true, false);
            } else if (SIMPLE_TYPES.includes(type.type)) {
                // It's a simple primitive
                out += this.convertPrimitive(type.type);
            }
        } else if (type['$ref']) {
            // If it's a reference
            out += this.convertRef(type['$ref']);
        } else if (type.value) {
            // If it has a fixed value, just set its type as the type of said value
            out += typeof type.value;
        }
        if (out === '') {
            // Output an error if the type couldn't be converted using logic above
            throw new Error(`Cannot handle type ${JSON.stringify(type)}`);
        }
        return out;
    }

    collapseExtendedTypes(types) {
        let collapsedTypes = {};
        // For each type
        for (let type of types) {
            // Get its id or the id of the type it extends
            let name = type['$extend'] || type.id;
            // Don't want this key to be merged (as it could cause conflicts if that is even possible)
            delete type['$extend'];
            // Have we seen it before?
            if (collapsedTypes.hasOwnProperty(name)) {
                // Merge with the type we already have, concatting any arrays
                _.mergeWith(collapsedTypes[name], type, (objValue, srcValue) => {
                    if (_.isArray(objValue)) {
                        return objValue.concat(srcValue);
                    }
                });
            } else {
                // Okay first time we see it, so for now it's collapsed
                collapsedTypes[name] = type;
            }
        }
        return Object.values(collapsedTypes);
    }

    convertTypes(types) {
        if (types === undefined) return [];
        // Collapse types that have an $extend in them
        types = this.collapseExtendedTypes(types);
        let convertedTypes = [];
        // For each type
        for (let type of types) {
            // Convert it as a root type
            let convertedType = this.convertType(type, true);
            // If we get nothing in return, ignore it
            if (convertedType === undefined) continue;
            // If we get its id in return, it's being weird and should just not be typechecked
            if (convertedType === type.id) convertedType = 'any';
            // Add converted source with proper keyword in front
            // This is here instead of in convertType, since that is also used for non root purposes
            if (type.functions || type.events) {
                // If it has functions or events it's a class
                convertedTypes.push(`class ${type.id} ${convertedType}`);
            } else if (type.enum) {
                convertedTypes.push(`enum ${this.convertEnumName(type.id)} ${convertedType}`);
            } else if (type.type === 'object' && !type.isInstanceOf) {
                // It's an object, that's not an instance of another one
                convertedTypes.push(`interface ${type.id} ${convertedType}`);
            } else {
                // It's just a type of some kind
                convertedTypes.push(`type ${type.id} = ${convertedType};`);
            }
        }
        return convertedTypes
    }

    convertProperties(properties) {
        if (properties === undefined) return [];
        let convertedProperties = [];
        // For each property, just add it as a const, appending | undefined if it's optional
        for (let prop of Object.keys(properties)) {
            convertedProperties.push(`const ${prop}: ${this.convertType(properties[prop])}${properties[prop].optional ? ' | undefined' : ''};`);
        }
        return convertedProperties;
    }

    convertParameters(parameters, includeName = true, name = undefined) {
        if (parameters === undefined) return [];
        let convertedParameters = [];
        // For each parameter
        for (let parameter of Object.keys(parameters)) {
            // If it's a function and that function is 'callback' we skip it since we don't use callbacks but promises instead
            if (parameters[parameter].type && parameters[parameter].name && parameters[parameter].type === 'function' && parameters[parameter].name === 'callback') continue;
            let out = '';
            // If includeName then include the name (add ? if optional)
            if (includeName) out += `${parameters[parameter].name ? parameters[parameter].name : parameter}${parameters[parameter].optional ? '?' : ''}: `;
            // Convert the paremeter type passing parent id as id
            parameters[parameter].id = name;
            out += this.convertType(parameters[parameter]);
            convertedParameters.push(out);
        }
        return convertedParameters;
    }

    convertSingleFunction(name, parameters, returnType, arrow, classy) {
        // function x() {} or () => {}?
        if (arrow) {
            // Okay () => {}, unless we want it classy (inside a class) in which case use name(): {}
            return `${classy ? `${name}` : ''}(${parameters.join(', ')})${classy ? ':' : ' =>'} ${returnType}`;
        } else {
            // If the name is a reversed keyword
            if (RESERVED.includes(name)) {
                // Add an underscore to the definition and export it as the proper name
                this.additionalTypes.push(`export {_${name} as ${name}};`);
                name = '_' + name;
            }
            return `function ${name}(${parameters.join(', ')}): ${returnType};`;
        }
    }

    convertFunction(func, arrow = false, classy = false) {
        let out = '';
        // Assume it returns void until proven otherwise
        let returnType = 'void';
        // Prove otherwise? either a normal returns or as an async promise
        if (func.returns) {
            returnType = this.convertType(func.returns);
        } else if (func.async === 'callback') {
            // If it's async then find the callback function and convert it to a promise
            let parameters = this.convertParameters(func.parameters.find(x => x.type === 'function' && x.name === 'callback').parameters, false, func.name);
            if (parameters.length > 1) {
                // Since these files are originally chrome, some things are a bit weird
                // Callbacks (which is what chrome uses) have no issues with returning multiple values
                // but firefox uses promises, which AFAIK can't handle that
                // This doesn't seem to be a problem yet, as firefox hasn't actually implemented the methods in question yet
                // But since it's in the schemas, it's still a problem for us
                // TODO: Follow firefox developments in this area
                console.log(`Warning: Promises cannot return more than one value: ${func.name}.`);
                // Just assume it's gonna be some kind of object that's returned from the promise
                // This seems like the most likely way the firefox team is going to make the promise return multiple values
                parameters = ['object']
            }
            // Use void as return type if there were no parameters
            // Note that the join is kinda useless (see long comments above)
            returnType = `Promise<${parameters.join(', ') || 'void'}>`
        }

        // Get parameters
        let parameters = this.convertParameters(func.parameters, true, func.name);
        // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
        // Therefore output multiple function choices where we one by one, strip the optional status
        // So we get an function that's '(one, two) | (two)' instead of '(one?, two)'
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].includes('?') && parameters.length > i + 1) {
                out += this.convertSingleFunction(func.name, parameters.slice(i + 1), returnType, arrow, classy) + (classy ? ';\n' : '\n');
            } else {
                break;
            }
        }
        parameters = parameters.map((x, i) => {
            if (parameters.length > 0 && i < parameters.length - 1) {
                return x.replace('?', '');
            }
            return x;
        });

        out += this.convertSingleFunction(func.name, parameters, returnType, arrow, classy);

        return out;
    }

    convertFunctions(functions) {
        if (functions === undefined) return [];
        let convertedFunctions = [];
        for (let func of functions) {
            convertedFunctions.push(this.convertFunction(func, false, false))
        }
        return convertedFunctions;
    }

    // noinspection JSMethodCanBeStatic
    convertSingleEvent(parameters, returnType) {
        // Use the helper that we define in HEADER
        return `WebExtEventListener<(${parameters.join(', ')}) => ${returnType}>`;
    }

    convertEvent(event, classy = false) {
        let out = '';
        // Assume it returns void until proven otherwise
        let returnType = 'void';
        // Prove otherwise?
        if (event.returns) {
            returnType = this.convertType(event.returns);
        }

        // Get parameters
        let parameters = this.convertParameters(event.parameters, true);
        // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
        // Therefore output multiple event choices where we one by one, strip the optional status
        // So we get an event that's '(one, two) | (two)' instead of '(one?, two)'
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].includes('?') && parameters.length > i + 1) {
                out += '\n| ' + this.convertSingleEvent(parameters.slice(i + 1), returnType, classy);
            } else {
                break;
            }
        }
        parameters = parameters.map((x, i) => {
            if (parameters.length > 0 && i < parameters.length - 1) {
                return x.replace('?', '');
            }
            return x;
        });

        // Add const and ; if we're not in a class
        out = `${!classy ? 'const ' : ''}${event.name}: ${this.convertSingleEvent(parameters, returnType, classy)}${out}${!classy ? ';' : ''}`;

        return out;
    }

    convertEvents(events) {
        if (events === undefined) return [];
        let convertedEvents = [];
        for (let event of events) {
            convertedEvents.push(this.convertEvent(event, false))
        }
        return convertedEvents;
    }

    convertNamespace() {
        // Get data for this namespace
        let data = this.namespaces[this.namespace];
        let out = '';

        if (data['$import']) {
            _.mergeWith(data, this.namespaces[data['$import']], (objValue, srcValue, key) => {
                if (key === 'namespace') return objValue;
                if (_.isArray(objValue)) {
                    return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
                        return (arrVal.id !== undefined && arrVal.id === othVal.id) || (arrVal.name !== undefined && arrVal.name === othVal.name);
                    });
                }
            });
        }

        // Clear additional types
        this.additionalTypes = [];
        // Convert everything
        this.types = this.convertTypes(data.types);
        this.properties = this.convertProperties(data.properties);
        this.functions = this.convertFunctions(data.functions);
        this.events = this.convertEvents(data.events);

        // Make sure there are no duplicates
        this.additionalTypes = _.uniqWith(this.additionalTypes, _.isEqual);

        // Output everything if needed
        out += `declare namespace browser.${data.namespace} {\n`;
        if (this.types.length > 0) out += `/* ${data.namespace} types */\n${this.types.join('\n\n')}\n\n`;
        if (this.additionalTypes.length > 0) out += `${this.additionalTypes.join('\n\n')}\n\n`;
        if (this.properties.length > 0) out += `/* ${data.namespace} properties */\n${this.properties.join('\n\n')}\n\n`;
        if (this.functions.length > 0) out += `/* ${data.namespace} functions */\n${this.functions.join('\n\n')}\n\n`;
        if (this.events.length > 0) out += `/* ${data.namespace} events */\n${this.events.join('\n\n')}\n\n`;
        out = out.slice(0, out.length - 1) + '}\n\n';

        this.out += out;
    }

    write(filename) {
        // Delete file
        fs.truncate(filename, 0, function () {
            // Write this.out to file except the very last character (which is an extra \n)
            fs.writeFileSync(filename, this.out.slice(0, this.out.length - 1));
        }.bind(this));
    }

    removeNamespace(name) {
        delete this.namespaces[name];
    }

    getIndex(namespace, section, id_or_name) {
        return this.namespaces[namespace][section].findIndex(x => {
            return x['id'] === id_or_name
                || x['name'] === id_or_name
                || x['$extends'] === id_or_name
                || x['$import'] === id_or_name;
        });
    }

    remove(namespace, section, id_or_name) {
        this.namespaces[namespace][section].splice(this.getIndex(namespace, section, id_or_name), 1);
    }

    edit(namespace, section, id_or_name, edit) {
        let index = this.getIndex(namespace, section, id_or_name);
        this.namespaces[namespace][section][index] = edit(this.namespaces[namespace][section][index]);
    }
}

exports.Converter = Converter;
