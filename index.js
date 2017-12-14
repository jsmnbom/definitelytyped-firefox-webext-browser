/*
Requires firefox source code to be downloaded, which can be found at https://archive.mozilla.org/pub/firefox/releases/ in the source subdirectory
Use as:
node index.js -f <FIREFOX VERSION> -s <SCHEMAS1> -s <SCHEMAS2> -o <OUTPUT_FILE>
Where SCHEMAS are toolkit/components/extensions/schemas and
browser/components/extensions/schemas inside the firefox source directory.
For example:
node index.js -f 58.0 -s firefox-58.0b6/toolkit/components/extensions/schemas -s firefox-58.0b6/browser/components/extensions/schemas -o index.d.ts
*/

"use strict";
const _ = require("lodash");

const argv = require("minimist")(process.argv.slice(2), {
    string: ['f']
});
const Converter = require("./converter").Converter;

// Namespace references that need renaming
const NAMESPACE_ALIASES = {'contextMenusInternal': 'menusInternal', 'manifest': '_manifest'};

// Header of the definitions file
const HEADER = `// Type definitions for WebExtension Development in FireFox ${argv['f']}
// Project: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
// Definitions by: Jacob Bom <https://github.com/bomjacob>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.4
// Generated using script at github.com/bomjacob/definitelytyped-firefox-webext-browser

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

let converter = new Converter(argv['s'], HEADER, NAMESPACE_ALIASES);
converter.setUnsupportedAsOptional();

/* Customizations */
// Remove test namespace since it's not exposed in api
converter.removeNamespace('test');
// Remove manifest.WebExtensionLangpackManifest as it's not exposed api
converter.remove('_manifest', 'types', 'WebExtensionLangpackManifest');
// browser.runtime.getManifest should return WebExtensionManifest
converter.edit('runtime', 'functions', 'getManifest', x => {
    x.returns = {'$ref': 'manifest.WebExtensionManifest'};
    return x;
});
// Remove NativeManifest since it's not an exposed api
converter.remove('_manifest', 'types', 'NativeManifest');
// Fix events dealing with messages
for (let path of [
    ['runtime', 'events', 'onMessage'],
    ['runtime', 'events', 'onMessageExternal'],
    ['extension', 'events', 'onRequest'],
    ['extension', 'events', 'onRequestExternal'],
]) converter.edit(...path, x => {
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
for (let path of [
    ['webRequest', 'events', 'onAuthRequired'],
    ['webRequest', 'events', 'onBeforeRequest'],
    ['webRequest', 'events', 'onBeforeSendHeaders'],
    ['webRequest', 'events', 'onHeadersReceived'],
]) converter.edit(...path, x => {
    // Return type of the callback is weirder than the schemas can express
    x.returns.converterTypeOverride = 'BlockingResponse | Promise<BlockingResponse>';
    // It's also optional, since you can choose to just listen to the event
    x.returns.optional = true;
    return x;
});
// Fix webrequest events
for (let path of [
    ['webRequest', 'events', 'onAuthRequired'],
    ['webRequest', 'events', 'onBeforeRequest'],
    ['webRequest', 'events', 'onBeforeSendHeaders'],
    ['webRequest', 'events', 'onHeadersReceived'],
]) converter.edit(...path, x => {
    // Return type of the callback is weirder than the schemas can express
    x.returns.converterTypeOverride = 'BlockingResponse | Promise<BlockingResponse>';
    // It's also optional, since you can choose to just listen to the event
    x.returns.optional = true;
    return x;
});
// Fix the lack of promise return in functions that firefox has but chrome doesn't
for (let func of [
    ['sessions', 'functions', 'setTabValue', 'Promise<void>'],
    ['sessions', 'functions', 'getTabValue', 'Promise<string | object | undefined>'],
    ['sessions', 'functions', 'removeTabValue', 'Promise<void>'],
    ['sessions', 'functions', 'setWindowValue', 'Promise<void>'],
    ['sessions', 'functions', 'getWindowValue', 'Promise<string | object | undefined>'],
    ['sessions', 'functions', 'removeWindowValue', 'Promise<void>'],
    ['sessions', 'functions', 'forgetClosedTab', 'Promise<void>'],
    ['sessions', 'functions', 'forgetClosedWindow', 'Promise<void>'],
    ['sessions', 'functions', 'getRecentlyClosed', 'Promise<Session[]>'],
    ['sessions', 'functions', 'restore', 'Promise<Session>'],
    ['sidebarAction', 'functions', 'close', 'Promise<void>'],
    ['sidebarAction', 'functions', 'open', 'Promise<void>'],
    ['sidebarAction', 'functions', 'setPanel', 'Promise<void>'],
    ['sidebarAction', 'functions', 'setIcon', 'Promise<void>'],
    ['sidebarAction', 'functions', 'setTitle', 'Promise<void>'],
    ['sidebarAction', 'functions', 'getPanel', 'Promise<string>'],
    ['sidebarAction', 'functions', 'getTitle', 'Promise<string>'],
]) converter.edit(func[0], func[1], func[2], x => {
    x.returns = {converterTypeOverride: func[3]};
    return x;
});
// Prevent some of Event from being promisified
converter.edit('events', 'types', 'Event', x => {
    for (let f of x.functions.slice(0,3)) {
        f.async = false;
    }
    console.log(x);
    return x;
});
// This should prob also not return promise
converter.edit('devtools.panels', 'types', 'ElementsPanel', x => {
    x.functions[0].async = false;
    return x;
});


converter.convert();
converter.write(argv['o']);


