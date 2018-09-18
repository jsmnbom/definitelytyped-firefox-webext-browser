/*
Requires firefox source code to be downloaded, which can be found at https://archive.mozilla.org/pub/firefox/releases/ in the source subdirectory
Install node modules using
    npm install
Build with
    tsc -p .
Use as:
    node build/index.js -f <FIREFOX VERSION> -s <SCHEMAS1> -s <SCHEMAS2> -o <OUTPUT_FILE>
Where SCHEMAS are toolkit/components/extensions/schemas and
browser/components/extensions/schemas inside the firefox source directory.
For example:
    node index.js -f 63.0 -s firefox-63.0b6/toolkit/components/extensions/schemas -s firefox-63.0b6/browser/components/extensions/schemas -o index.d.ts
*/

"use strict";

const argv = require("minimist")(process.argv.slice(2), {
    string: ['f']
});

import {Converter} from "./converter";

// Namespace references that need renaming
const NAMESPACE_ALIASES = { 'contextMenusInternal': 'menusInternal', 'manifest': '_manifest' };

// Header of the definitions file
const HEADER = `// Type definitions for WebExtension Development in FireFox ${argv['f']}
// Project: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
// Definitions by: Jasmin Bom <https://github.com/jsmnbom>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.9
// Generated using script at github.com/jsmnbom/definitelytyped-firefox-webext-browser

interface WebExtEventBase<TAddListener extends (...args: any[]) => any, TCallback> {
    addListener: TAddListener;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}

type WebExtEvent<TCallback extends (...args: any[]) => any> = WebExtEventBase<(callback: TCallback) => void, TCallback>;

interface Window {
    browser: typeof browser;
}

`;

let converter = new Converter(Array.isArray(argv['s']) ? argv['s'] : new Array(argv['s']), HEADER, NAMESPACE_ALIASES);
converter.setUnsupportedAsOptional();

/* Customizations */
// Remove test namespace since it's not exposed in api
converter.removeNamespace('test');
// browser.runtime.getManifest should return WebExtensionManifest
converter.edit('runtime', 'functions', 'getManifest', x => {
    x.returns = { '$ref': 'manifest.WebExtensionManifest' };
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
for (let path of <string[][]> [
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
for (let path of <string[][]> [
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
for (let [namespace, funcs] of <Array<[string, Array<[string, boolean|string]>]>> [
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
        ['openPopup', 'void']
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
        ['getTitle', 'string']
    ]],
    ['tabs', [
        ['discard', 'void'],
        ['toggleReaderMode', 'void'],
        ['show', 'void'],
        ['hide', 'number[]']
    ]]
]) {
    for (let [name, ret] of funcs) converter.edit(namespace, 'functions', name, x => {
        if (ret) {
            x.returns = { converterTypeOverride: `Promise<${ret}>` };
        } else {
            x.returns = { converterTypeOverride: 'void' };
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
// This should prob also not return promise
converter.edit('devtools.panels', 'types', 'ElementsPanel', x => {
    x.functions[0].async = false;
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
    return Port
});

converter.convert();
converter.write(argv['o']);


