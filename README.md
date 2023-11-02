# DefinitelyTyped Firefox WebExt Browser

Script to generate type definitions for WebExtension Development in Firefox.

See the output at: [DefinitelyTyped/DefinitelyTyped/types/firefox-webext-browser](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/firefox-webext-browser).

Install definitions using `npm install @types/firefox-webext-browser`.

**Currently based on `FIREFOX_109_0b9_RELEASE`.**

## Usage
*You should only need to do this if you wanna update the definitions, to just use them, see the npm install line above.*

Install dependencies.
```console
$ npm install
```

Build TypeScript files. Either just once, or optionally watch for files changes. (execute only one of below commands).
```console
$ npm run once
$ npm run watch
```

Download proper Firefox sources to firefox/VERSION.
See https://hg.mozilla.org/mozilla-unified/tags for available tags.
```console
$ node build/download.js --tag <TAG> --out <OUTDIR>
$ node build/download.js --tag FIREFOX_63_0b6_RELEASE --out schemas
```

Then actually generate definitions.
```console
$ node build/index.js --version <FIREFOX VERSION> --out <OUTPUT_FILE> [SCHEMA_FOLDER]...
$ node build/index.js --version 63.0 --out index.d.ts schemas/FIREFOX_63_0b6_RELEASE/{toolkit,browser}
```

And place the generated index.d.ts in [DefinitelyTyped/DefinitelyTyped/types/firefox-webext-browser](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/firefox-webext-browser), and write any tests you feel is necesary for the change (usually not necessary for simple version updates imo)

Finally in DefinitelyTyped project, run `pnpm dprint fmt -- 'types/firefox-webext-browser/**/*.ts'` to format generated file as well as the tests.

Note that for sending PRs to DefinitelyTyped you need to include why you changed. For simple updates (Firefox version 
changes), this can be easily generated and uploaded to gist using the included script (requires the gist tool and 
that you are logged in):
```console
diffgen FIREFOX_63_0b6_RELEASE FIREFOX_64_0b1_RELEASE
```
