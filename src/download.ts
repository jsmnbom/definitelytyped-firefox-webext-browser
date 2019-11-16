/**
 * Downloads webextension schemas from firefox source code.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom.
 */

"use strict";

const request = require('request');
const unzipper = require('unzipper');
const path = require('path');

const argv = require("minimist")(process.argv.slice(2), {
    string: ['t', 'v', 'out']
});

const ARCHIVE_URL = 'https://hg.mozilla.org/mozilla-unified/archive';
const TOOLKIT_URL = `${ARCHIVE_URL}/${argv['t']}.zip/toolkit/components/extensions/schemas/`;
const BROWSER_URL = `${ARCHIVE_URL}/${argv['t']}.zip/browser/components/extensions/schemas/`;

for (let url of [TOOLKIT_URL, BROWSER_URL]) {
    console.log('Downloading ', TOOLKIT_URL);
    const dir = path.resolve(argv['o'], argv['v']);
    console.log('Outputting to', dir);
    request(url).pipe(unzipper.Extract({path: dir}));
}