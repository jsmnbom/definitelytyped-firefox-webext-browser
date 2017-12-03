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

interface WebExtEventListener<T extends (...args: any[]) => any> {
    addListener: (callback: T) => void;
    removeListener: (listener: T) => void;
    hasListener: (listener: T) => boolean;
}

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

converter.convert();
converter.write(argv['o']);


