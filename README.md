# DefinitelyTyped Firefox WebExt Browser

Script to generate type definitions for WebExtension Development in FireFox.

See the output at: [DefinitelyTyped/DefinitelyTyped/types/firefox-webext-browser](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/firefox-webext-browser).

Install definitions using `npm install @types/firefox-webext-browser`.

**Currently based on `FIREFOX_70_0b13_RELEASE`.**

## Usage
*You should only need to do this if you wanna update the definitions, to just use them, see the npm install line above.*

Install dependencies
```console
$ npm install
```

Build typescript files. Either just once, or optionally watch for files changes. (execute only one of below commands)
```console
$ npm run once
$ npm run watch
```

Download proper firefox sources to firefox/VERISION.
See https://hg.mozilla.org/mozilla-unified/tags for available tags.
```console
$ node build/download.js -t <TAG> -v <VERSION> -o <OUTDIR>
$ node build/download.js -t FIREFOX_70_0b13_RELEASE -v 70.0b13 -o firefox
```

Then actually generate definitions
```console
$ node build/index.js -f <FIREFOX VERSION> -s <SCHEMAS1> -s <SCHEMAS2> -o <OUTPUT_FILE>
$ node build/index.js -f 70.0b13 -s firefox/70.0b13/mozilla-unified-FIREFOX_70_0b13_RELEASE/toolkit/components/extensions/schemas -s firefox/70.0b13/mozilla-unified-FIREFOX_70_0b13_RELEASE/browser/components/extensions/schemas -o index.d.ts
```

And place the generated index.d.ts in [DefinitelyTyped/DefinitelyTyped/types/firefox-webext-browser](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/firefox-webext-browser).

Note that for sending PRs to DefinitelyTyped you need to include why you changed. For simple updates (FF version 
changes), this can be easily generated and uploaded to gist using for example:
```console
diff -uNr firefox/63.0b6 firefox/64.0b10 | gist -p -d "Diff of {toolkit,browser}/components/extensions/schemas/*.* in firefox source code, from version 63.0b6 to 64.0b10. Downloaded from https://hg.mozilla.org/mozilla-unified/summary." -f "63.0b6-to-64.0b10.diff"
```
