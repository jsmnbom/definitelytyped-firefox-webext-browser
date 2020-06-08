/**
 * Generates typescript definitions for webextension development in firefox.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom.
 */

"use strict";

import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
    string: ['firefox_version', 'out'],
    alias: {v: 'firefox_version', version: 'firefox_version',  o: 'out'}
});

import {Converter} from "./converter";

// Namespace references that need renaming
const NAMESPACE_ALIASES = {'contextMenusInternal': 'menusInternal', 'manifest': '_manifest'};

// Header of the definitions file
const HEADER = `// Type definitions for non-npm package WebExtension Development in FireFox ${argv['f']}
// Project: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
// Definitions by: Jasmin Bom <https://github.com/jsmnbom>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.9
// Generated using script at github.com/jsmnbom/definitelytyped-firefox-webext-browser

interface WebExtEvent<TCallback extends (...args: any[]) => any> {
    addListener(cb: TCallback): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}

interface Window {
    browser: typeof browser;
}

`;

let converter = new Converter(argv['_'], HEADER, NAMESPACE_ALIASES);
converter.setUnsupportedAsOptional();

/* Customizations */
// Remove test namespace since it's not exposed in api
converter.removeNamespace('test');
// browser.runtime.getManifest should return WebExtensionManifest
converter.edit('runtime', 'functions', 'getManifest', x => {
    x.returns = {'$ref': 'manifest.WebExtensionManifest'};
    return x;
});
// Fix dupe _NativeManifestType
converter.edit('_manifest', 'types', 'NativeManifest', x => {
    x.choices[0].properties.type.converterTypeOverride = '"pkcs11"| "stdio"';
    x.choices[1].properties.type.converterTypeOverride = '"storage"';
    return x;
});
// Fix events dealing with messages
let test: Array<[string, string, string]> = [
    ['runtime', 'events', 'onMessage'],
    ['runtime', 'events', 'onMessageExternal'],
    ['extension', 'events', 'onRequest'],
    ['extension', 'events', 'onRequestExternal'],
];
for (let path of test) converter.edit_path(path, x => {
    // The message parameter actually isn't optional
    x.parameters[0].optional = false;
    // Add a missing parameter to sendResponse
    x.parameters[2].parameters = [
        {
            name: 'response',
            type: 'any',
            optional: true,
        }
    ];
    // Runtime events only: Add "Promise<any>" return type, the result gets passed to sendResponse
    if (path[0] === 'runtime') {
        x.returns.converterTypeOverride = 'boolean | Promise<any>';
    }
    return x;
});
// Fix webrequest events
for (let path of <string[][]>[
    ['webRequest', 'events', 'onAuthRequired'],
    ['webRequest', 'events', 'onBeforeRequest'],
    ['webRequest', 'events', 'onBeforeSendHeaders'],
    ['webRequest', 'events', 'onHeadersReceived'],
]) converter.edit_path(path, x => {
    // Return type of the callback is weirder than the schemas can express
    x.returns.converterTypeOverride = 'BlockingResponse | Promise<BlockingResponse>';
    // It's also optional, since you can choose to just listen to the event
    x.returns.optional = true;
    return x;
});
// Fix webrequest events
for (let path of <string[][]>[
    ['webRequest', 'events', 'onAuthRequired'],
    ['webRequest', 'events', 'onBeforeRequest'],
    ['webRequest', 'events', 'onBeforeSendHeaders'],
    ['webRequest', 'events', 'onHeadersReceived'],
]) converter.edit_path(path, x => {
    // Return type of the callback is weirder than the schemas can express
    x.returns.converterTypeOverride = 'BlockingResponse | Promise<BlockingResponse>';
    // It's also optional, since you can choose to just listen to the event
    x.returns.optional = true;
    return x;
});
// Additional fix for webrequest.onAuthRequired
converter.edit('webRequest', 'events', 'onAuthRequired', x => {
    x.parameters = x.parameters.filter((y: TypeSchema) => y.name !== 'callback');
    return x;
});
// Fix the lack of promise return in functions that firefox has but chrome doesn't
for (let [namespace, funcs] of <Array<[string, Array<[string, boolean | string]>]>>[
    ['clipboard', [['setImageData', 'void']]],
    ['contextualIdentities', [
        ['create', 'ContextualIdentity'],
        ['get', 'ContextualIdentity'],
        ['query', 'ContextualIdentity[]'],
        ['remove', 'ContextualIdentity'],
        ['update', 'ContextualIdentity']
    ]],
    ['proxy', [
        ['register', 'void'],
        ['unregister', 'void']
    ]],
    ['theme', [
        ['getCurrent', '_manifest.ThemeType'],
        ['reset', false],
        ['update', false]
    ]],
    ['browserAction', [['openPopup', 'void']]],
    ['find', [
        ['find', '{\ncount: number;\nrangeData?: Array<{\nframePos: number;\nstartTextNodePos: number;\nendTextNodePos: number;\nstartOffset: number;\nendOffset: number;\n}>;\nrectData?: Array<{\nrectsAndTexts: {\nrectList: Array<{\ntop: number;\nleft: number;\nbottom: number;\nright: number;\n}>;\ntextList: string[];\n};\ntextList: string;\n}>;\n}'],
        ['highlightResults', false],
        ['removeHighlighting', false]
    ]],
    ['pageAction', [
        ['setPopup', false],
        ['openPopup', 'void'],
        ['isShown', 'boolean']
    ]],
    ['pkcs11', [
        ['getModuleSlots', '{\nname: string;\ntoken?: {\nname: string;\nmanufacturer: string;\nHWVersion: string;\nFWVersion: string;\nserial: string;\nisLoggedIn: string;\n};\n}'],
        ['installModule', 'void'],
        ['isModuleInstalled', 'boolean'],
        ['uninstallModule', 'void']
    ]],
    ['sessions', [
        ['setTabValue', 'void'],
        ['getTabValue', 'string | object | undefined'],
        ['removeTabValue', 'void'],
        ['setWindowValue', 'void'],
        ['getWindowValue', 'string | object | undefined'],
        ['removeWindowValue', 'void'],
        ['forgetClosedTab', 'void'],
        ['forgetClosedWindow', 'void'],
        ['getRecentlyClosed', 'Session[]'],
        ['restore', 'Session']
    ]],
    ['sidebarAction', [
        ['close', 'void'],
        ['open', 'void'],
        ['setPanel', 'void'],
        ['setIcon', 'void'],
        ['setTitle', 'void'],
        ['getPanel', 'string'],
        ['getTitle', 'string'],
        ['isOpen', 'boolean']
    ]],
    ['tabs', [
        ['discard', 'void'],
        ['toggleReaderMode', 'void'],
        ['show', 'void'],
        ['hide', 'number[]'],
        ['captureTab', 'string']
    ]],
    ['dns', [
        ['resolve', 'DNSRecord']
    ]],
    ['contentScripts', [
        ['register', 'RegisteredContentScript']
    ]],
    ['webRequest', [
        ['getSecurityInfo', 'SecurityInfo']
    ]],
    ['commands', [
        ['update', 'void'],
        ['reset', 'void']
    ]],
    ['search', [
        ['get', 'SearchEngine[]']
    ]],
    ['userScripts', [
        ['register', 'RegisteredUserScript']
    ]],
    ['captivePortal', [
        ['getState', '_UndefinedState'],
        ['getLastChecked', 'number']
    ]],
    ['networkStatus', [
        ['getLinkInfo', 'NetworkLinkInfo']
    ]]
]) {
    for (let [name, ret] of funcs) converter.edit(namespace, 'functions', name, x => {
        if (ret) {
            x.returns = {converterTypeOverride: `Promise<${ret}>`};
        } else {
            x.returns = {converterTypeOverride: 'void'};
        }
        return x;
    });
}
// Prevent some of Event from being promisified
converter.edit('events', 'types', 'Event', x => {
    for (let f of x.functions.slice(0, 3)) {
        f.async = false;
    }
    return x;
});
// Remove bookmarks.import and bookmarks.export as it breaks things
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/24937
converter.remove('bookmarks', 'functions', 'import');
converter.remove('bookmarks', 'functions', 'export');
converter.remove('bookmarks', 'events', 'onImportBegan');
converter.remove('bookmarks', 'events', 'onImportEnded');
// Fix runtime.Port.postMessage
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23542
converter.edit('runtime', 'types', 'Port', Port => {
    Port.properties.postMessage.parameters = [{type: "object", name: "message"}];
    Port.properties.error = {converterTypeOverride: 'Error', optional: true};
    Port.events = [
        {
            name: 'onMessage',
            type: 'function',
            parameters: [
                {type: 'object', name: 'response'}
            ]
        },
        {
            name: 'onDisconnect',
            type: 'function',
            parameters: [
                {"$ref": 'Port', name: 'port'}
            ]
        }
    ];
    delete Port.properties.onDisconnect;
    delete Port.properties.onMessage;

    return Port
});
// Type alias can't reference themselves
// See https://github.com/Microsoft/TypeScript/issues/6230
converter.edit('extensionTypes', 'types', 'PlainJSONValue', PlainJSONValue => {
    PlainJSONValue.choices = [
        {type: "null"},
        {type: "string"},
        {type: "number"},
        {type: "boolean"},
        {id: "_PlainJSONArray", converterAdditionalType: 'interface _PlainJSONArray extends Array<PlainJSONValue> {}'},
        {id: "_PlainJSONObject", converterAdditionalType: 'interface _PlainJSONObject {[key: string]: PlainJSONValue;}'}
    ];
    return PlainJSONValue;
});
// Fix error return type in some proxy events
converter.edit('proxy', 'events', 'onError', (onError) => {
    onError.parameters[0].converterTypeOverride = 'Error';
    return onError;
});
converter.edit('proxy', 'events', 'onProxyError', (onProxyError) => {
    onProxyError.parameters[0].converterTypeOverride = 'Error';
    return onProxyError;
});
converter.edit('_manifest', 'types', 'PersistentBackgroundProperty', (PersistentBackgroundProperty) => {
    PersistentBackgroundProperty.type = 'boolean';
    PersistentBackgroundProperty.deprecated = PersistentBackgroundProperty.choices[1].deprecated;
    delete PersistentBackgroundProperty.choices;
    return PersistentBackgroundProperty
});
converter.edit('permissions', 'functions', 'remove', remove => {
    remove.parameters[1].parameters = [{
        "type": "boolean"
    }];
    return remove
});

converter.convert();
converter.write(argv['o']);


