/**
 * Downloads webextension schemas from firefox source code.
 *
 * See ../README.md for usage.
 *
 * @author Jasmin Bom.
 */

'use strict';

import request from 'request';
import unzipper, { Entry } from 'unzipper';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { Writer } from 'fstream';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  string: ['tag', 'out'],
  alias: { t: 'tag', o: 'out' },
});

const ARCHIVE_URL = 'https://hg.mozilla.org/mozilla-unified/archive';
const TOOLKIT_URL = `${ARCHIVE_URL}/${argv['tag']}.zip/toolkit/components/extensions/schemas/`;
const BROWSER_URL = `${ARCHIVE_URL}/${argv['tag']}.zip/browser/components/extensions/schemas/`;

for (let url of [TOOLKIT_URL, BROWSER_URL]) {
  console.log('Downloading ', TOOLKIT_URL);
  const dir = path.resolve(argv['out'], argv['tag']);
  console.log('Outputting to', dir);
  fs.mkdirSync(dir, { recursive: true });
  request(url)
    .pipe(unzipper.Parse())
    .on('entry', (entry: Entry) => {
      let [, component, , , , ...rest] = path.normalize(entry.path).split(path.sep);
      const stripped_path = path.join(dir, component, ...rest);
      entry.pipe(Writer({ path: stripped_path }));
    });
}
