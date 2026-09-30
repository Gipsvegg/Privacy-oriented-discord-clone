


## Crypto (E2EE) setup (if you wanna edit crypto stuff do this) 
***Claude wrote this entire thing though it should still be correct as far as I can see***

Encryption runs in the browser using [ts-mls](https://www.npmjs.com/package/ts-mls).
Source code lives in `ClientApp/crypto.js` and gets bundled into `wwwroot/js/crypto.bundle.js`.

ts-mls has not har a third party security review and as such might be a big weakness in our security.

### Everyone else
Nothing to do. The bundle is committed, so pull and hit run.
**Never edit `wwwroot/js/crypto.bundle.js` by hand**: it gets overwritten on every build.

### Crypto dev: first time on a new machine
1. Install Node.js LTS from https://nodejs.org, then close and reopen all terminals and the IDE.
   Check with `node -v` and `npm -v`.
2. Clone or pull the repo.
3. In the folder with `package.json`, run:
```sh
   npm install
```
4. Create the pre-commit hook in Git Bash (from the repo root). `printf` avoids Windows line-ending problems:
```sh
   printf '#!/bin/sh\nnpm run build && git add wwwroot/js/crypto.bundle.js\n' > .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
```
If `package.json` is not in the repo root, add `cd <ProjectFolder> || exit 1` as the second line of the hook.
5. Test: `npm run build`, run the app, open F12 → Console and check for errors.

### Crypto dev: daily workflow
1. `git pull` before starting (especially when switching between PCs).
2. Edit `ClientApp/crypto.js`.
3. `npm run build`, then hard refresh the browser (Ctrl+F5) to test.
4. Commit as normal: the hook rebuilds and adds the bundle automatically.
   Check with `git show --stat` that `crypto.bundle.js` is in the commit.
5. Push before switching to another PC.

If a pull changes `package.json` or `package-lock.json`, run `npm install` again.

### Troubleshooting
| Error | Fix |
| --- | --- |
| `npm` not recognized | Node isn't installed, or the terminal was open before installing. Restart it. |
| `cannot spawn .git/hooks/pre-commit` | Windows line endings in the hook. Run `dos2unix .git/hooks/pre-commit`. |
| `No matching export ... for import "X"` | That function name doesn't exist in ts-mls. Check the spelling. |
| Changes don't show in the browser | Forgot `npm run build`, or the browser cached the old bundle. Ctrl+F5. |
