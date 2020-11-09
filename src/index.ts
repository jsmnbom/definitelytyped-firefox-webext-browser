/**
 * Generates typescript definitions for webextension development in firefox.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom.
 */

import minimist from 'minimist';
import Converter from './converter';
import override from './overrides';

const argv = minimist(process.argv.slice(2), {
  string: ['firefox_version', 'out'],
  alias: { v: 'firefox_version', version: 'firefox_version', o: 'out' },
});

// Namespace references that need renaming
const NAMESPACE_ALIASES = { contextMenusInternal: 'menusInternal', manifest: '_manifest' };

// Header of the definitions file
const HEADER = `// Type definitions for non-npm package WebExtension Development in FireFox ${argv['firefox_version']}
// Project: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
// Definitions by: Jasmin Bom <https://github.com/jsmnbom>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 3.4
// Generated using script at github.com/jsmnbom/definitelytyped-firefox-webext-browser

interface WebExtEvent<TCallback extends (...args: any[]) => any> {
    addListener(cb: TCallback): void;
    removeListener(cb: TCallback): void;
    hasListener(cb: TCallback): boolean;
}

`;

let converter = new Converter(argv['_'], HEADER, NAMESPACE_ALIASES);
converter.setUnsupportedAsOptional();

override(converter);

converter.convert();
converter.write(argv['out']);
