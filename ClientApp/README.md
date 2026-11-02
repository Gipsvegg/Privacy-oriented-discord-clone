# ClientApp (browser bundles)
***Written by Claude. Should still be correct as far as I can see.***

Code in this folder runs in the browser. esbuild bundles each file into `wwwroot/js/`:

| Source | Bundle | What it does |
| --- | --- | --- |
| `ClientApp/crypto.js` | `wwwroot/js/crypto.bundle.js` | End-to-end encryption (MLS) |
| `ClientApp/markdown-render.js` | `wwwroot/js/markdown-render.bundle.js` | Renders markdown in messages |

`npm run build` builds both. `npm run build-crypto` / `npm run build-markdown` build one each.

## Everyone else
Nothing to do. The bundles are committed, so pull and hit run.
**Never edit anything in `wwwroot/js/*.bundle.js` by hand**: it gets overwritten on every build.

## Setup: first time on a new machine
1. Install Node.js LTS from https://nodejs.org, then close and reopen all terminals and the IDE.
   Check with `node -v` and `npm -v`.
2. Clone or pull the repo.
3. In the folder with `package.json`, run:
```sh
   npm install
```
4. Create the pre-commit hook in Git Bash (from the repo root). `printf` avoids Windows line-ending problems:
```sh
   printf '#!/bin/sh\nnpm run build && git add wwwroot/js/crypto.bundle.js wwwroot/js/markdown-render.bundle.js\n' > .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
```
If `package.json` is not in the repo root, add `cd <ProjectFolder> || exit 1` as the second line of the hook.
5. Test: `npm run build`, run the app, open F12 → Console and check for errors.

## Daily workflow
1. `git pull` before starting (especially when switching between PCs).
2. Edit the source file in `ClientApp/`.
3. `npm run build`, then hard refresh the browser (Ctrl+F5) to test.
4. Commit as normal: the hook rebuilds and adds both bundles automatically.
   Check with `git show --stat` that the bundle you changed is in the commit.
5. Push before switching to another PC.

If a pull changes `package.json` or `package-lock.json`, run `npm install` again.

## Crypto (E2EE)
Encryption runs in the browser using [ts-mls](https://www.npmjs.com/package/ts-mls).
Group state is stored in the browser's IndexedDB, so the server only ever sees ciphertext.

ts-mls has not had a third-party security review, and as such it might be a big weakness in our security.

## Markdown
Messages are decrypted in the browser and then rendered with [markdown-it](https://www.npmjs.com/package/markdown-it).
The server never sees the text, so all formatting happens here.

**Enabled:** line breaks, `\` escapes, *italic*, **bold**, ~~strikethrough~~, `inline code`, code blocks,
quotes, lists, links and bare URLs. It uses the `'zero'` preset, so anything not in the `.enable([...])` list is off.

**Off on purpose. Don't turn these on without talking to the group:**
- **Raw HTML.** A message containing `<img onerror=...>` would run code in everyone's browser,
  and that code could read the encryption keys out of IndexedDB.
- **Images.** `![](https://...)` makes every recipient's browser fetch that URL,
  which leaks their IP address to whoever owns it.

**Safety layers:**
- Output always goes through [DOMPurify](https://www.npmjs.com/package/dompurify) before it touches `innerHTML`.
- Links get `target="_blank"` and `rel="noopener noreferrer"`.
- Everything is bundled locally. Never load these libraries from a CDN, because that leaks users' IPs too.

Planned: syntax highlighting in code blocks with highlight.js (core + only the languages we need).

## Troubleshooting
| Error | Fix |
| --- | --- |
| `npm` not recognized | Node isn't installed, or the terminal was open before installing. Restart it. |
| `cannot spawn .git/hooks/pre-commit` | Windows line endings in the hook. Run `dos2unix .git/hooks/pre-commit`. |
| `No matching export ... for import "X"` | That function name doesn't exist in the library. Check the spelling. |
| Changes don't show in the browser | Forgot `npm run build`, or the browser cached the old bundle. Ctrl+F5. |
| Messages show raw `**text**` | `window.markdown` didn't load. Check the console, and check that the bundle is built. |