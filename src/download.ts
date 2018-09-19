/**
 * Downloads webextension schemas from firefox source code.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom.
 */

"use strict";

const request = require('request');
const tar = require('tar');
const fs = require('fs');
const path = require('path');

const argv = require("minimist")(process.argv.slice(2), {
    string: ['t', 'v', 'out']
});

const ARCHIVE_URL = 'https://hg.mozilla.org/mozilla-unified/archive';
const TOOLKIT_URL = `${ARCHIVE_URL}/${argv['t']}.tar.gz/toolkit/components/extensions/schemas/`;
const BROWSER_URL = `${ARCHIVE_URL}/${argv['t']}.tar.gz/browser/components/extensions/schemas/`;

function mkDirByPathSync(targetDir: string, { isRelativeToScript = false } = {}) {
    // https://stackoverflow.com/a/40686853/3920144
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    return targetDir.split(sep).reduce((parentDir, childDir) => {
        const curDir = path.resolve(baseDir, parentDir, childDir);
        try {
            fs.mkdirSync(curDir);
        } catch (err) {
            if (err.code === 'EEXIST') { // curDir already exists!
                return curDir;
            }
            // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
            if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
                throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
            }
            const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
            if (!caughtErr || caughtErr && targetDir === curDir) {
                throw err; // Throw if it's just the last created dir.
            }
        }
        return curDir;
    }, initDir);
}
for (let url of [TOOLKIT_URL, BROWSER_URL]) {
    console.log('Downloading ', TOOLKIT_URL);
    const dir = path.resolve(argv['o'], argv['v']);
    console.log('Outputting to', dir);
    mkDirByPathSync(dir);
    request(url).pipe(tar.x({
        strip: 1,
        cwd: dir
    }));
}