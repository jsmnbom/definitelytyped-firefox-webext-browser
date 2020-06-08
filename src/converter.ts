import * as fs from "fs";
import * as path from "path";

import stripJsonComments from "strip-json-comments";
import * as _ from "lodash";

import {descToMarkdown, toDocComment} from './desc-to-doc';

// Reserved keywords in typescript
const RESERVED = ["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
    "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null",
    "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with"];

// Types that are considered "simple"
const SIMPLE_TYPES = ['string', 'integer', 'number', 'boolean', 'any', 'null'];
const ALREADY_OPTIONAL_RETURNS = ['any', 'undefined', 'void'];

// Readable names for "allowedContexts" values from the schema
const CONTEXT_NAMES: Indexable<string> = {
    'addon_parent': 'Add-on parent',
    'content': 'Content scripts',
    'devtools': 'Devtools pages',
    'proxy': 'Proxy scripts',
};

// Comment "X context only" for these contexts
const CTX_CMT_ONLY_ALLOWED_IN = ['content', 'devtools', 'proxy'];

// Comment "Not allowed in" for these contexts
const CTX_CMT_NOT_ALLOWED_IN = ['content', 'devtools'];

// Comment "Allowed in" for these contexts
const CTX_CMT_ALLOWED_IN = ['proxy'];

// Formats an allowedContexts array to a readable string
function formatContexts(contexts: string[] | undefined, outputAlways = false) {
    if (!contexts || contexts.length === 0) {
        if (outputAlways) {
            // No contexts are specified, but we can likely still output something
            contexts = [];
        } else {
            return '';
        }
    }
    // Check if this thing is only allowed in one context
    for (let context of contexts) {
        if (/^(.*)_only$/.exec(context) && CTX_CMT_ONLY_ALLOWED_IN.includes(RegExp.$1)) {
            return `Allowed in: ${CONTEXT_NAMES[RegExp.$1]} only`;
        }
    }
    let lines = [];
    // If a context from CTX_CMT_NOT_ALLOWED_IN isn't in contexts, comment it as "not allowed in"
    let notAllowedIn = CTX_CMT_NOT_ALLOWED_IN.filter(context => !contexts!.includes(context));
    if (notAllowedIn.length > 0) {
        lines.push(`Not allowed in: ${notAllowedIn.map(ctx => CONTEXT_NAMES[ctx]).join(', ')}`);
    }
    // If a context from CTX_CMT_ALLOWED_IN is in contexts, comment it as "allowed in"
    let allowedIn = CTX_CMT_ALLOWED_IN.filter(context => contexts!.includes(context));
    if (allowedIn.length > 0) {
        lines.push(`Allowed in: ${allowedIn.map(ctx => CONTEXT_NAMES[ctx]).join(', ')}`);
    }
    return (lines.length > 0) ? lines.join('\n\n') : '';
}

// Creates a doc comment out of a schema object
function commentFromSchema(schema: TypeSchema | NamespaceSchema | NameDesc) {
    const namespace = schema as NamespaceSchema;
    const type = schema as TypeSchema;

    const doclines = [];
    if (namespace.description) {
        doclines.push(descToMarkdown(namespace.description));
    }

    const contexts = formatContexts(namespace.allowedContexts);
    if (contexts) {
        // Separate with an empty line
        if (doclines.length > 0) doclines.push('');
        doclines.push(contexts);
    }

    if (type.parameters) {
        for (const param of type.parameters) {
            // '@param' is redundant in TypeScript code if it has no description.
            if (!param.description) continue;
            // Square brackets around optional parameter names is a jsdoc convention
            const name = (param.optional) ? `[${param.name}]` : param.name;
            const desc = (param.description) ? ' ' + descToMarkdown(param.description) : '';
            doclines.push(`@param ${name}${desc}`);
        }
    }
    if (type.deprecated) {
        let desc = type.deprecated;
        if (typeof desc !== "string") {
            desc = type.description || "";
        }
        doclines.push(`@deprecated ${descToMarkdown(desc)}`);
    } else if (type.unsupported) {
        doclines.push(`@deprecated Unsupported on Firefox at this time.`);
    }
    if (type.returns && type.returns.description) {
        doclines.push(`@returns ${descToMarkdown(type.returns.description)}`);
    }
    if (doclines.length === 0) {
        return '';
    }
    return toDocComment(doclines.join('\n')) + '\n';
}

// Iterate over plain objects in nested objects and arrays
function* deepIteratePlainObjects(item: object): Iterable<object> {
    if (_.isArray(item)) {
        // Got an array, check its elements
        for (let x of item) {
            yield* deepIteratePlainObjects(x);
        }
    } else if (_.isPlainObject(item)) {
        // Got a plain object, yield it
        yield item;
        // Check its properties
        for (let x of Object.values(item)) {
            yield* deepIteratePlainObjects(x);
        }
    }
}

export class Converter {
    out: string;
    readonly namespace_aliases: Indexable<string>;
    readonly schemaData: [string, NamespaceSchema[]][];
    readonly namespaces: Indexable<NamespaceSchema>;
    namespace: string = "";
    additionalTypes: string[] = [];
    types: string[] = [];
    properties: string[] = [];
    functions: string[] = [];
    events: string[] = [];

    constructor(folders: string[], header: string, namespace_aliases: Indexable<string>) {
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
                let resNamespace: NamespaceSchema;
                if (!this.namespaces.hasOwnProperty(namespace.namespace)) {
                    resNamespace = {
                        namespace: namespace.namespace,
                        types: [],
                        properties: {},
                        functions: [],
                        events: [],
                        description: namespace.description,
                        permissions: [],
                        allowedContexts: []
                    };
                    this.namespaces[namespace.namespace] = resNamespace;
                } else {
                    resNamespace = this.namespaces[namespace.namespace]
                }

                // Concat or extend namespace

                if (namespace.types) {
                    resNamespace.types!.push(...namespace.types);
                }
                if (namespace.properties) {
                    Object.assign(resNamespace.properties, namespace.properties);
                }
                if (namespace.functions) {
                    resNamespace.functions!.push(...namespace.functions);
                }
                if (namespace.events) {
                    resNamespace.events!.push(...namespace.events);
                }
                if (namespace.permissions) {
                    resNamespace.permissions!.push(...namespace.permissions);
                }
                if (namespace.allowedContexts) {
                    resNamespace.allowedContexts.push(...namespace.allowedContexts);
                }
                if (namespace.$import) {
                    resNamespace.$import = namespace.$import
                }
            }
        }
    }

    setUnsupportedAsOptional() {
        for (let type of deepIteratePlainObjects(this.namespaces) as TypeSchema[]) {
            if (type.unsupported) {
                type.optional = true;
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

    collectSchemas(folders: string[]) {
        // For each schema file
        for (let folder of folders) {
            const files = fs.readdirSync(folder);
            for (let file of files) {
                if (path.extname(file) === '.json') {
                    // Strip json comments, parse and add to data array
                    let json = String(fs.readFileSync(path.join(folder, file)));
                    json = stripJsonComments(json);
                    this.schemaData.push([file, JSON.parse(json)]);
                }
            }
        }
    }

    // noinspection JSMethodCanBeStatic
    convertPrimitive(type: string) {
        if (type === 'integer') {
            return 'number'
        }
        return type;
    }

    convertClass(type: TypeSchema) {
        // Convert each property, function and event of a class
        let out = `{\n`;
        let convertedProperties = this.convertObjectProperties(type);
        if (type.functions) for (let func of type.functions) {
            convertedProperties.push(this.convertFunction(func, true, true));
        }
        if (type.events) for (let event of type.events) {
            convertedProperties.push(this.convertEvent(event, true));
        }
        out += `${convertedProperties.join(';\n') + ';'}`;
        out += `\n}`;

        return out;
    }

    convertObjectProperties(type: TypeSchema) {
        let convertedProperties = [];

        if (type.$import) {
            const imp = _.find(this.namespaces[this.namespace].types, (x: TypeSchema) => {
                // We need the split cause theme.json apparently has a "manifest.ManifestBase"
                // despite being in the manifest namespace already
                const imp = type.$import!.split('.')[0];
                return x.id === imp || x.name == imp;
            });
            // Merge it, preferring type values not imp, and making sure we don't have dupes in arrays
            _.mergeWith(type, imp, (objValue, srcValue, key) => {
                if (_.isArray(objValue)) {
                    return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
                        return (arrVal.id !== undefined && arrVal.id === othVal.id) || (arrVal.name !== undefined && arrVal.name === othVal.name);
                    });
                }
                if (objValue !== undefined && !_.isObject(objValue)) {
                    return objValue;
                }
            });
        }

        // For each simple property
        if (type.properties) {
            for (let name of Object.keys(type.properties)) {
                let propertyType = type.properties[name];
                // Make sure it has a proper id by adding parent id to id
                propertyType.id = type.id + (name === 'properties' ? '' : ('_' + name));
                // Output property type (adding a ? if optional)
                convertedProperties.push(`${commentFromSchema(propertyType)}${name}${type.properties[name].optional ? '?' : ''}: ${this.convertType(propertyType)}`);
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

    convertRef(ref: string) {
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
        } else if (!this.namespaces[this.namespace].types!.find(x => x.id === ref)) {
            console.log(`Warning: Cannot find reference "${ref}", assuming the browser knows better.`);
            // Add a type X = any, so the type can be used, but won't be typechecked
            this.additionalTypes.push(`type ${ref} = any;`);
        }
        return ref;
    }

    // noinspection JSMethodCanBeStatic
    convertName(name: string) {
        // Convert from snake_case to PascalCase
        return name.split('_').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('');
    }

    convertType(type: TypeSchema, root = false): string {
        // Check if we've overridden it, likely for a type that can't be represented in json schema
        if (type.converterTypeOverride) {
            return type.converterTypeOverride;
        }
        if (type.converterAdditionalType && type.id) {
            this.additionalTypes.push(type.converterAdditionalType);
            return type.id;
        }
        let out = '';
        // Check type of type
        if (type.choices) {
            // Okay so it's a choice between several types, we need to check
            // if choices include enums, and if so combine them
            let choices: TypeSchema[] = [];
            let enums: Enum[] = [];
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
                //x.id = type.id;
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
            // We can only output enums in the namespace root (a schema enum, instead of e.g. a property having an enum
            // as type)
            if (root) {
                // So if we are in the root
                // Add each enum value, and format its comment
                const normalized = type.enum
                    .map(x => {
                        if (typeof x !== "string") {
                            return {
                                comment: commentFromSchema(x),
                                value: x.name
                            };
                        }
                        return {
                            comment: "",
                            value: x
                        };
                    });
                // Should it be output across multiple lines?
                // Yes if either more than 2 elements or we got multiple lines already
                const multiline = normalized.length > 2 || normalized.some(x => x.comment.includes('\n'));
                if (multiline) out += '\n';
                // For each entry, join using | adding newlines as needed
                for (const [i, x] of normalized.entries()) {
                    out += x.comment;
                    out += i > 0 ? `|` : '';
                    out += `"${x.value}"${multiline && i !== normalized.length - 1 ? '\n' : ''}`
                }
                out += ';';
            } else {
                if (type.id) {
                    const typeName = `_${this.convertName(type.id)}`;
                    // If we're not in the root, add the enum as an additional type instead, adding an _ in front of
                    // the name We convert the actual enum based on rules above by passing through the whole type code
                    // again, but this time as root
                    // As per https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23002 don't use actual
                    // typescript enums
                    this.additionalTypes.push(`${commentFromSchema(type)}type ${typeName} = ${this.convertType(type, true)}`);
                    // And then just reference it by name in output
                    out += typeName;
                } else {
                    // inline
                    out += type.enum.map(x => `"${x}"`).join(" | ");
                }
            }
        } else if (type.type) {
            // The type has an actual type, check it
            if (type.type === 'object') {
                // It's an object, how is the object constructed?
                if (type.functions || type.events) {
                    // It has functions or events, treat it as a class
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
                            // Otherwise it's some object we don't know about, therefore just treat it as a random
                            // object
                            out += `object/*${type.isInstanceOf}*/`;
                        }
                    } else {
                        // If the schema does not do that, try converting as a reference
                        out += this.convertRef(type.isInstanceOf);
                    }
                } else if (type.additionalProperties) {
                    // If it has additional, but not normal properties, try converting those properties as a type,
                    // passing the parent name
                    type.additionalProperties.id = type.id;
                    out += `{[key: string]: ${this.convertType(type.additionalProperties)}}`;
                } else {
                    // Okay so it's just some kind of object, right?...
                    out += 'object';
                }
            } else if (type.type === 'array') {
                // It's an array
                // Does it specify a fixed amount of items?
                if (type.minItems && type.maxItems && type.minItems === type.maxItems) {
                    // Yes, fixed amount of items, output it as an array literal
                    out += `[${new Array(type.minItems).fill(this.convertType(type.items!)).join(', ')}]`
                } else if (type.items) {
                    // Figure out the array type, passing parent name
                    type.items.id = type.id;
                    let arrayType = this.convertType(type.items) as string;
                    // Very bad check to see if it's a "simple" type in array terms
                    // This just checks if it's an enum or object, really
                    // TODO: Could probably be done better
                    if (arrayType.includes('\n') || arrayType.includes(';') || arrayType.includes(',') || arrayType.includes('"')) {
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
        } else if (type.$ref) {
            // If it's a reference
            out += this.convertRef(type.$ref);
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

    collapseExtendedTypes(types: TypeSchema[]) {
        let collapsedTypes: Indexable<TypeSchema> = {};
        // For each type
        for (let type of types) {
            // Get its id or the id of the type it extends
            let name = type.$extend || type.id as string;
            // Don't want this key to be merged (as it could cause conflicts if that is even possible)
            delete type.$extend;
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

    extendImportedTypes(types: TypeSchema[]) {
        // For each type
        for (let type of types) {
            // If it has an import
            if (type.$import) {
                // Find what we're importing
                const imp = _.find(types, (x: TypeSchema) => {
                    // We need the split cause theme.json apparently has a "manifest.ManifestBase"
                    // despite being in the manifest namespace already
                    const imp = type.$import!.split('.')[0];
                    return x.id === imp || x.name == imp;
                });
                // Merge it, preferring type values not imp, and making sure we don't have dupes in arrays
                _.mergeWith(type, imp, (objValue, srcValue, key) => {
                    if (_.isArray(objValue)) {
                        return _.uniqWith(objValue.concat(srcValue), (arrVal, othVal) => {
                            return (arrVal.id !== undefined && arrVal.id === othVal.id) || (arrVal.name !== undefined && arrVal.name === othVal.name);
                        });
                    }
                    if (objValue !== undefined && !_.isObject(objValue)) {
                        return objValue;
                    }
                });
            }
        }
    }

    convertTypes(types: TypeSchema[] | undefined) {
        if (types === undefined) return [];
        // Collapse types that have an $extend in them
        types = this.collapseExtendedTypes(types);
        // Extend types that have an $import in them
        this.extendImportedTypes(types);
        let convertedTypes = [];
        // For each type
        for (let type of types) {
            // Convert it as a root type
            let convertedType = this.convertType(type, true);
            // If we get nothing in return, ignore it
            if (convertedType === undefined) continue;
            // If we get its id in return, it's being weird and should just not be typechecked
            if (convertedType === type.id) convertedType = 'any';
            // Get the comment
            let comment = commentFromSchema(type);
            // Add converted source with proper keyword in front
            // This is here instead of in convertType, since that is also used for non root purposes
            if ((type.functions || type.events) || (type.type === 'object' && !type.isInstanceOf)) {
                // If it has functions or events, or is an object that's not an instance of another one, it's an
                // interface
                convertedTypes.push(`${comment}interface ${type.id} ${convertedType}`);
            } else if (type.enum) {
                // As per https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23002 don't use actual
                // typescript enums
                convertedTypes.push(`${comment}type ${this.convertName(type.id as string)} = ${convertedType}`);
            } else {
                // It's just a type of some kind
                convertedTypes.push(`${comment}type ${type.id} = ${convertedType};`);
            }
        }
        return convertedTypes
    }

    convertProperties(properties: Indexable<TypeSchema> | undefined) {
        if (properties === undefined) return [];
        let convertedProperties = [];
        // For each property, just add it as a const, appending | undefined if it's optional
        for (let prop of Object.keys(properties)) {
            convertedProperties.push(`${commentFromSchema(properties[prop])}const ${prop}: ${this.convertType(properties[prop])}${properties[prop].optional ? ' | undefined' : ''};`);
        }
        return convertedProperties;
    }

    convertParameters(parameters: TypeSchema[] | undefined, includeName = true, name?: string) {
        if (parameters === undefined) return [];
        let convertedParameters = [];
        // For each parameter
        for (let parameter of parameters) {
            let out = '';
            // If includeName then include the name (add ? if optional)
            if (includeName) out += `${parameter.name ? parameter.name : parameter}${parameter.optional ? '?' : ''}: `;
            // Convert the paremeter type passing parent id as id
            parameter.id = name;
            out += this.convertType(parameter);
            convertedParameters.push(out);
        }
        return convertedParameters;
    }

    convertSingleFunction(name: string, returnType: string, arrow: boolean, classy: boolean, func: TypeSchema) {
        let parameters = this.convertParameters(func.parameters, true, func.name);
        // function x() {} or () => {}?
        if (arrow) {
            // Okay () => {}, unless we want it classy (inside a class) in which case use name(): {}
            return `${classy ? `${commentFromSchema(func)}${name}${func.optional ? '?' : ''}` : ''}(${parameters.join(', ')})${classy ? ':' : ' =>'} ${returnType}`;
        } else {
            // If the name is a reversed keyword
            if (RESERVED.includes(name)) {
                // Add an underscore to the definition and export it as the proper name
                this.additionalTypes.push(`export {_${name} as ${name}};`);
                name = '_' + name;
            }
            // Optional top-level functions aren't supported, because commenting parameters doesn't work for them
            return `${commentFromSchema(func)}function ${name}(${parameters.join(', ')}): ${returnType};`;
        }
    }

    convertFunction(func: TypeSchema, arrow = false, classy = false) {
        let out = '';
        // Assume it returns void until proven otherwise
        let returnType: string | TypeSchema = 'void';
        // Prove otherwise? either a normal returns or as an async promise
        if (func.returns) {
            // First check if it has a callbackc and a return value
            // If it does it's probably cause we overwrote the return value in index.ts and we need to remove the
            // callback parameter anyways
            let callback = func.parameters && func.parameters.find(x => x.type === 'function' && x.name === func.async);
            if (callback) {
                func.parameters = func.parameters!.filter(x => x !== callback);
            }
            returnType = this.convertType(func.returns);
            if (func.returns.optional && !ALREADY_OPTIONAL_RETURNS.includes(returnType)) returnType += ' | void';
        } else {
            if (func.async === undefined) func.async = 'callback';
            // If it's async then find the callback function and convert it to a promise
            let callback = func.parameters && func.parameters.find(x => x.type === 'function' && x.name === func.async);
            if (callback) {
                // Remove callback from parameters as we're gonna handle it as a promise return
                func.parameters = func.parameters!.filter(x => x !== callback);
                let parameters = this.convertParameters(callback.parameters, false, func.name);
                if (parameters.length > 1) {
                    // Since these files are originally chrome, some things are a bit weird
                    // Callbacks (which is what chrome uses) have no issues with returning multiple values
                    // but firefox uses promises, which AFAIK can't handle that
                    // This doesn't seem to be a problem yet, as firefox hasn't actually implemented the methods in
                    // question yet But since it's in the schemas, it's still a problem for us TODO: Follow firefox
                    // developments in this area
                    console.log(`Warning: Promises cannot return more than one value: ${func.name}.`);
                    // Just assume it's gonna be some kind of object that's returned from the promise
                    // This seems like the most likely way the firefox team is going to make the promise return
                    // multiple values
                    parameters = ['object']
                }
                // Use void as return type if there were no parameters
                // Note that the join is kinda useless (see long comments above)
                let promiseReturn = parameters[0] || 'void';

                // https://github.com/jsmnbom/definitelytyped-firefox-webext-browser/issues/21
                //if (callback.optional && !ALREADY_OPTIONAL_RETURNS.includes(promiseReturn)) promiseReturn += ' |
                // undefined';

                returnType = `Promise<${promiseReturn}>`;
                // Because of namespace extends(?), a few functions can pass through here twice,
                // so override the return type since the callback was removed and it can't be converted again
                func.returns = {converterTypeOverride: returnType};
                // Converted now
                delete func.async;
            } else if (func.async && func.async !== 'callback') {
                // Since it's async it's gotta return a promise... the type just isn't specified in the schemas
                returnType = 'Promise<any>';
            }
        }

        // Create overload signatures for leading optional parameters
        // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
        // Therefore output multiple function choices where we one by one, strip the optional status

        // Check if "parameters[index]" is optional with at least one required parameter following it
        let isLeadingOptional = (parameters: TypeSchema[], index: number) => {
            let firstRequiredIndex = parameters.findIndex(x => !x.optional);
            return firstRequiredIndex > index;
        };

        // Optional parameters with at least one required parameter following them, marked as non-optional
        let leadingOptionals: TypeSchema[] = [];
        // The rest of the parameters
        let rest = [];
        for (let [i, param] of (func.parameters || []).entries()) {
            if (isLeadingOptional(func.parameters!, i)) {
                // It won't be optional in the overload signature, so create a copy of it marked as non-optional
                leadingOptionals.push({...param, optional: false});
            } else {
                rest.push(param);
            }
        }

        // Output the normal signature
        out += this.convertSingleFunction(func.name!, returnType, arrow, classy, {
            ...func,
            parameters: rest,
        });
        // Output signatures for any leading optional parameters
        for (let i = 0; i < leadingOptionals.length; i++) {
            let funcWithParams = {
                ...func,
                parameters: leadingOptionals.slice(i).concat(rest),
            };
            out += "\n" + this.convertSingleFunction(func.name!, returnType, arrow, classy, funcWithParams) + (classy ? ';\n' : '');
        }

        return out;
    }

    convertFunctions(functions: TypeSchema[] | undefined) {
        if (functions === undefined) return [];
        let convertedFunctions = [];
        for (let func of functions) {
            convertedFunctions.push(this.convertFunction(func, false, false))
        }
        return convertedFunctions;
    }

    // noinspection JSMethodCanBeStatic
    convertSingleEvent(parameters: string[], returnType: string, extra: string[] | undefined, name: string) {
        if (extra) {
            // It has extra parameters, so output custom event handler
            let listenerName = '_' + this.convertName(`${this.namespace}_${name}_Event`);
            this.additionalTypes.push(`interface ${listenerName}<TCallback = (${parameters.join(', ')}) => ${returnType}> {
    addListener(cb: TCallback, ${extra.join(', ')}): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}`);
            //this.additionalTypes.push(`type ${listenerName}<T =`);
            return `${listenerName}`;
        } else {
            // It has no extra parameters, so just use the helper that we define in HEADER
            return `WebExtEvent<(${parameters.join(', ')}) => ${returnType}>`;
        }
    }

    convertEvent(event: TypeSchema, classy = false) {
        let out = '';
        // Assume it returns void until proven otherwise
        let returnType = 'void';
        // Prove otherwise?
        if (event.returns) {
            returnType = this.convertType(event.returns);
            if (event.returns.optional && !ALREADY_OPTIONAL_RETURNS.includes(returnType)) returnType += ' | void';
        }

        // Check if we have extra parameters (for the addListener() call)
        let extra;
        if (event.extraParameters) {
            // If we do, get them
            extra = this.convertParameters(event.extraParameters, true);
        }

        // Get parameters
        let parameters = this.convertParameters(event.parameters, true);
        // Typescript can't handle when e.g. parameter 1 is optional, but parameter 2 isn't
        // Therefore output multiple event choices where we one by one, strip the optional status
        // So we get an event that's '(one, two) | (two)' instead of '(one?, two)'
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].endsWith('?') && parameters.length > i + 1) {
                out += '\n| ' + this.convertSingleEvent(parameters.slice(i + 1), returnType, extra, event.name!);
            } else {
                break;
            }
        }
        parameters = parameters.map((x, i) => {
            if (parameters.length > 0 && i < parameters.length - 1) {
                // Remove the optional ?
                // Do not remove a ? if it's part of an object definition (which spans multiple lines)
                return x.replace(/\?(?![\s\S]*\n)/, '');
            }
            return x;
        });

        // Add const and ; if we're not in a class
        out = `${!classy ? 'const ' : ''}${event.name}: ${this.convertSingleEvent(parameters, returnType, extra, event.name!)}${out}${!classy && event.optional ? ' | undefined' : ''}${!classy ? ';' : ''}`;

        // Comment it
        out = commentFromSchema(event) + out;

        return out;
    }

    convertEvents(events: TypeSchema[] | undefined) {
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

        if (data.$import) {
            let skipKeys = ['namespace', 'description', 'permissions'];
            _.mergeWith(data, this.namespaces[data.$import], (objValue, srcValue, key) => {
                if (skipKeys.includes(key)) return objValue;
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

        // Comment the description and permissions/manifest keys
        let doclines = [];
        if (data.description) {
            doclines.push(descToMarkdown(data.description));
        }
        if (data.permissions && data.permissions.length > 0) {
            // Manifest keys are in the permissions array, but start with "manifest:"
            let permissions = [];
            let manifestKeys = [];
            for (let perm of data.permissions) {
                if (/^manifest:(.*)/.exec(perm)) {
                    manifestKeys.push(RegExp.$1);
                } else {
                    permissions.push(perm);
                }
            }
            if (permissions.length > 0) {
                doclines.push(`Permissions: ${permissions.map(p => `\`${p}\``).join(', ')}`);
            }
            if (manifestKeys.length > 0) {
                doclines.push(`Manifest keys: ${manifestKeys.map(p => `\`${p}\``).join(', ')}`);
            }
        }
        // Allowed contexts
        let contexts = formatContexts(data.allowedContexts, true);
        if (contexts) {
            doclines.push(contexts);
        }
        if (doclines.length > 0) {
            out += toDocComment(doclines.join('\n\n')) + '\n';
        }

        out += `declare namespace browser.${data.namespace} {\n`;
        if (this.types.length > 0) out += `/* ${data.namespace} types */\n${this.types.join('\n\n')}\n\n`;
        if (this.additionalTypes.length > 0) out += `${this.additionalTypes.join('\n\n')}\n\n`;
        if (this.properties.length > 0) out += `/* ${data.namespace} properties */\n${this.properties.join('\n\n')}\n\n`;
        if (this.functions.length > 0) out += `/* ${data.namespace} functions */\n${this.functions.join('\n\n')}\n\n`;
        if (this.events.length > 0) out += `/* ${data.namespace} events */\n${this.events.join('\n\n')}\n\n`;
        out = out.slice(0, out.length - 1) + '}\n\n';

        this.out += out;
    }

    write(filename: string) {
        // Delete file
        fs.truncate(filename, 0, () => {
            // Write this.out to file except the very last character (which is an extra \n)
            fs.writeFileSync(filename, this.out.slice(0, this.out.length - 1));
        });
    }

    removeNamespace(name: string) {
        delete this.namespaces[name];
    }

    getIndex(namespace: string, section: string, id_or_name: string): number {
        return (this.namespaces[namespace] as any)[section].findIndex((x: TypeSchema) => {
            return x['id'] === id_or_name
                || x['name'] === id_or_name
                || x['$extend'] === id_or_name
                || x['$import'] === id_or_name;
        });
    }

    remove(namespace: string, section: string, id_or_name: string) {
        (this.namespaces[namespace] as any)[section].splice(this.getIndex(namespace, section, id_or_name), 1);
    }

    edit(namespace: string, section: string, id_or_name: string, edit: (x: any) => any) {
        console.log(`Editing ${namespace}.${section}.${id_or_name}`);
        const index = this.getIndex(namespace, section, id_or_name);
        const sectionObj = (this.namespaces[namespace] as any)[section];
        if (sectionObj[index] === undefined || sectionObj[index] === null) {
            console.warn('WARNING: Is either undefined or null!');
        }
        sectionObj[index] = edit(sectionObj[index]);
    }

    edit_path(path: [string, string, string] | string[], edit: (x: any) => any) {
        this.edit(path[0], path[1], path[2], edit);
    }
}
