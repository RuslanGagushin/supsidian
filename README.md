# Supstack

**Supstack (formerly Supsidian) shows a folder of Markdown notes (a vault) as a board of nested cards, with Org-style TODOs, an agenda, and git sync between your devices.**

Every card is an ordinary Markdown note in your vault. Supstack adds nothing to your files except the frontmatter it needs to link cards together, so other editors, Git, Syncthing and any other tool keep working on the same folder.

This repository wraps the Supstack page into native apps with [Tauri 2](https://v2.tauri.app):

| Platform | Download | Vault access |
|---|---|---|
| Windows 10/11 | `.msi` or `-setup.exe` (about 10 MB, uses the built-in WebView2) | any folder, read and written in place |
| macOS 11+ | universal `.dmg` (Apple Silicon and Intel) | any folder, read and written in place |
| Android 7+ | `.apk` (64-bit ARM) | any folder you pick with the system picker, kept across restarts |

---

## What it does

### Cards and the board
- **Every note is a card.** A card shows its title, its parents and a preview of its text. The preview length and card height are adjustable.
- **Cards nest, and a card can have several parents.** Parents are listed in the `parents` frontmatter property, so one note can sit under *Personal* and under *Documents* at the same time. The breadcrumb, **↑ Go to parent** and the side tree let you move around.
- **Depth control:** show 1 or 2 levels of children, or all of them (`∞`).
- **Board, list or notes layout.** The notes layout lists the card's own note and its children as rows (where each sits, when it changed, its title, two lines of text, tags and the first image) and opens the selected note beside the list, as a mail app does: the arrow keys page through the notes, the handle between them sizes the list, and ⤢ gives the note the whole width. On phones a tap opens the note over the list.
- Grouping by parent, sorting (manual, or recently modified first), and **saved views** so a board you like is one tap away.
- **Quick capture:** type into *Start typing a new card…* at the top of a board to create a child card there. You can choose a **template note** for a card's children.
- **Select mode:** select several cards to move, re-parent or delete them together. **Undo** reverts the last card action.

### Editor
- **Live preview editing:** the note is one editor (CodeMirror 6) that shows its Markdown rendered: headings, bold, italic, highlights, code, links, tags, tasks, bullets and TODO keywords read as they will look, and their Markdown shows only where the caret is. Callouts and code blocks render as blocks and open into their Markdown when you click or arrow into them; tables stay rendered and are edited a cell at a time. Click a link to follow it (Ctrl/Cmd+click opens a card in the editor), tick a checkbox to toggle its task, select text for a floating format bar (bold, italic, highlight, code, link, heading, lists, quote). Undo and redo cover every edit. Your files stay plain Markdown.
- **Foldable callouts and table editing:** `> [!info]+` makes a callout that starts open and `> [!info]-` one that starts folded; click its title to fold or unfold it. Click a table cell to edit it in place; Tab and Shift+Tab go to the next and previous cell, Enter goes to the cell below (Tab or Enter at the end adds a row, Enter on an empty last row leaves the table), Shift+Enter breaks a line in a cell, and Alt+arrows move the row or column. The table's Markdown keeps its columns lined up. Right-click a cell (or use the toolbar's table button) to add, move, delete, align or sort rows and columns; the + buttons under and beside a table add a row or a column.
- A source mode for the whole file, a reading view, **full-width** and **focus** modes, and a toolbar for formatting, images and files.
- `[[` or `Ctrl+L` links to another card; `/` opens the insert menu.
- Turn a selection into a **new child card**.

### TODOs and the agenda
- Org-mode style keywords on headings and list items: `TODO`, `NEXT`, `DONE` and the others you configure, with **priorities** and **`SCHEDULED` / `DEADLINE`** dates.
- The **agenda** (calendar icon, or `Ctrl+Shift+K`) collects them from the whole vault by day, with a calendar to jump to a date and a quick-capture form for new entries. Plain checkbox items can be included too.

### Search and filters
- `Ctrl+F` searches the board; filter by tag with `+tag` / `-tag`.
- `Ctrl+O` opens any card by name; `Ctrl+P` opens the command list.

### Sync
- **Git sync:** the vault folder is a git repository. **Sync now** (or the automatic sync, after edits and every few minutes) commits your changes, merges the remote branch and pushes. Set the remote URL (HTTPS) and a personal access token in the sync button's panel.
- If a note changed on two devices, your text stays in place and the other version is saved next to it as `Note (conflict …).md`, so nothing is lost.
- The access token is kept in the app, not in the vault, so it is never committed. A `.gitignore` is created on the first sync for `.trash` and temporary files.
- On Android the repository lives in the app's private storage and is copied to and from the folder you picked on every sync, so the vault takes up space twice there.

### Look and keyboard
- A full-height sidebar with search, a blue *New card* button and the vault at the bottom; Inter type, white cards on warm grey.
- Light and dark themes; English and Russian interface.
- Emacs-flavoured details: a mode line under each board (layout, depth, sort, card count) and a minibuffer with key hints. Most actions have shortcuts. Org-style `C-c` chords work in the editor, for example `C-c C-t` to cycle a TODO state and `C-c C-s` / `C-c C-d` to schedule or set a deadline.
- On phones the layout switches to a single column, the side tree becomes a drawer, and the Android **Back** button closes the editor, menus and dialogs before leaving the app.
- **Settings** has a tab per group: Appearance, Cards, Board, Agenda, Git (in the app) and About, which shows the version and checks for updates.

### Updates
- The Windows and macOS apps check GitHub Releases when they start and twice a day. When a new version is out, a note appears in the minibuffer. **Settings → About → Install and restart** downloads it, checks its signature, installs it and restarts the app. Nothing is installed without asking, and the automatic check can be turned off there.
- Android can't update its own APK, so **Install** opens the new APK's download instead. Open the downloaded file to install it over the old one. This needs a signed APK; see [Android signing](#android-signing).

---

## Install

### From GitHub
Open the repository's **Releases** page (or the latest **Actions → Build apps** run, under **Artifacts**) and download the file for your platform.

- **Windows:** run the `-setup.exe` or the `.msi`.
- **macOS:** open the `.dmg` and drag Supstack to Applications. The app is not signed with an Apple Developer ID, so the first time, **right-click the app → Open**.
- **Android:** copy the `.apk` to the phone and open it, allowing installs from that app when Android asks. With USB debugging on, `adb install -r <file>.apk` works too.

### First start
1. Tap **Open vault folder** and choose your vault. On Android, go to the folder, tap **Use this folder**, then **Allow**.
2. After that, **Reopen** opens the same vault straight away.

Want to look around first? **Try the demo vault** loads a sample board in memory; nothing is saved.

---

## Where your data lives

| What | Where |
|---|---|
| Notes (cards) | plain `.md` files in the vault's `cards/` folder |
| Daily notes (also cards) | `daily notes/YYYY-MM-DD.md` |
| Pasted, dropped and uploaded files | `attachments/` |
| Card parents | the `parents` frontmatter property in each note |
| Vault settings: pins, saved views, card and board options | `.supstack/settings.json` in the vault (versions up to 0.15 kept them in `.obsidian/plugins/supsidian/data.json`; they move on first open) |
| App settings, fold state, agenda view | stored per installation, not in the vault |

**The three folders are the same in every vault**, so there is nothing to set up: Supstack creates them as needed, and a folder that already exists with other letter case (`Cards/`) is used as it is. Each time a vault is opened, notes outside them are moved into `cards/`, keeping their subfolders, so links to them keep working; files that are not notes stay where they are.

**Changes made outside the app**, in another editor or by a sync tool such as Syncthing, are picked up every few seconds while the app is in front, and whenever you switch back to it. Desktop writes go through a temporary file and a rename, so other apps never see a half-written note.

---

## How the app is put together

```
web/src/                    the Supstack page's sources: page.html, css/, js/ (ES modules) and vendor/ (libraries, fonts)
  js/core/                  pure logic: frontmatter, hierarchy graph, board model, Org TODOs and dates, tables, texts
  js/services/              app state, the vault, saving and undo, attachments, Git sync, updates (no DOM)
  js/ui/                    everything on screen: board, tree, editor, agenda, files, menus, settings
  js/main.js                the entry point: loads the layers in order and starts the page
scripts/page.mjs            builds them into one file, web/supstack.html (not committed)
scripts/web.mjs             builds the page and copies it to dist/index.html before every app build
src-tauri/                  the Tauri app: window, permissions (capabilities/default.json), icons
tauri-plugin-vault/         vault file access: pick the folder, list, read, write, delete
  src/desktop.rs            Windows/macOS: plain file access with atomic writes
  android/…/VaultPlugin.kt  Android: Storage Access Framework, plus system-bar insets for the page
.github/workflows/apps.yml  builds all three apps on GitHub
scripts/android-signing.mjs creates an Android signing key and wires it into Gradle
icon.png                    source of every app icon (`npm run icons` regenerates them)
tests/                      page tests: the real page in headless Chrome on an in-memory vault, plus unit tests
                            of js/core/ in Node and a check of the layers (`npm test`)
```

The page is still a single HTML file, so it also works opened straight from disk. Its sources live in `web/src/`: `page.html` is the page with an `<!-- include: path -->` line where each stylesheet and library goes, and a `<!-- bundle: js/main.js -->` line where the app goes; `scripts/page.mjs` fills them in, bundling the app's ES modules with esbuild into one plain script. `npm test` and `npm run web` build the page first; `npm run page` builds just the page. `npm run codemirror` rebuilds `web/src/vendor/codemirror.js` after a CodeMirror update. Inside the app, the page switches its file access to the vault plugin and opens `http(s)://` and `mailto:` links in the system browser or mail app.

The app's modules come in three layers, and each uses only the ones before it (`tests/architecture.test.mjs` checks this):

- `core/` is pure logic. It doesn't touch the DOM, the browser's storage or the app's state; everything it needs comes in as arguments. That is why `tests/core.test.mjs` can run it in Node.
- `services/` holds the app state and everything that reads and writes the vault. It never draws anything. When something happens that the page should show (a message, notes changed on disk, the editor should save first), it emits an event from `services/events.js`, and the `ui/` modules subscribe to those events.
- `ui/` renders and handles input, calling into `services/` and `core/`.

Each module imports what it uses, so a new file is just a new module imported where it is needed. A module that only sets itself up also goes into the list in `main.js`. For the page tests, `js/expose.js` makes every export a global when the page sets `window.__SN_EXPOSE__` before it loads; `tests/harness.mjs` does that.

On Android the app draws edge to edge (behind the status bar and gesture bar). The vault plugin measures those bars and pads the page so nothing ends up underneath them.

---

## Build on GitHub (no tools needed on your computer)

1. Push the repository to GitHub.
2. Open **Actions → Build apps → Run workflow**. A run takes about 15–25 minutes, less on later runs thanks to the cache.
3. Download the results from the run's **Artifacts**: **Supstack-Windows**, **Supstack-macOS**, **Supstack-Android**.
4. To publish a release, push a tag: `git tag v0.1.0 && git push --tags`. The same files are attached to a GitHub Release.

### Desktop update signing
The installed Windows and macOS apps only accept updates signed with the key whose public half is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

- Add the private key as the repository secret `TAURI_SIGNING_PRIVATE_KEY`, with the contents of `~/.tauri/supsidian.key`. If the key has a password, also add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Tagged builds are then signed, and the release gets a `latest.json` (made by `scripts/updater-manifest.mjs`) that the apps read.
- Without the secret, the apps still build, but a release can't update them. **Check now** falls back to comparing versions with GitHub and opens the release page.
- Keep a backup of the private key. If it is lost, installed apps can't take signed updates any more, and everyone has to download one release by hand. To start over with a new key, run `npx tauri signer generate -w ~/.tauri/supsidian.key`, then put the new `.pub` contents in `tauri.conf.json`.
- When releasing, bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; the page takes its version from `package.json` when it is built. A test checks that they match.

### Android signing
The workflow always builds a **release** APK. Android only installs signed APKs, and an update must be signed with the same key as the installed app.

- **Without setup**, each run signs the APK with a new one-off key. It installs fine, but the next build can't update it: uninstall first. Your notes are safe, since they live in the vault folder.
- **To update in place**, add two repository secrets under **Settings → Secrets and variables → Actions**:
  - `ANDROID_KEYSTORE_BASE64`: the key file as base64. Create the key once locally with `npm run android:init` and then `node scripts/android-signing.mjs`. Encode it with `base64 -w0 src-tauri/gen/android/supsidian.jks`, or on Windows with `[Convert]::ToBase64String([IO.File]::ReadAllBytes("src-tauri\gen\android\supsidian.jks"))`.
  - `ANDROID_KEY_PASSWORD`: the password from `src-tauri/gen/android/keystore.properties`.

Switching from a build signed with a different key (for example an older debug build) needs one uninstall.

---

## Build on your computer

All platforms need **Rust** (<https://rustup.rs>) and **Node.js 20+** (<https://nodejs.org>). Then run `npm install` once in this folder.

| Command | What it does |
|---|---|
| `npm run dev` | runs the desktop app without installing it |
| `npm run build` | builds the installers for the current OS |
| `npm run android:init` | creates the Android project in `src-tauri/gen/android` (once) |
| `npm run android:dev` | runs the app on a phone connected by USB |
| `npm run android:build` | builds a release APK for 64-bit ARM |
| `npm run icons` | regenerates every icon from `icon.png` (then `git checkout src-tauri/icons/android/*/ic_launcher_foreground.png`: those are made by hand for the Android mask) |
| `npm test` | runs the page tests in `tests/` with headless Chrome (set `CHROME_PATH` to use another Chromium) |
| `npm run test:rust` | runs the vault plugin's Rust tests (file access, git sync) |

### Windows
1. Install **Microsoft C++ Build Tools** (<https://visualstudio.microsoft.com/visual-cpp-build-tools/>) with **Desktop development with C++**. WebView2 is already part of Windows 10 and 11.
2. Run `npm run build`. The first build compiles the Rust crates and takes several minutes.
3. The installers are in `src-tauri\target\release\bundle\msi\` and `…\bundle\nsis\`.

### macOS
1. Install Apple's command-line tools: `xcode-select --install`.
2. Run `npm run build`. The app is in `src-tauri/target/release/bundle/macos/`, the disk image in `…/bundle/dmg/`.
3. For one build that runs on both Apple Silicon and Intel:
   ```sh
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   npm run tauri build -- --target universal-apple-darwin
   ```

### Android (on Windows or macOS)
1. Install **Android Studio** (<https://developer.android.com/studio>). Under **Settings → Languages & Frameworks → Android SDK**, install **Android 16 (API 36)**, plus **Build-Tools**, **NDK (Side by side)**, **Command-line Tools** and **Platform-Tools**.
2. Point the build at them.

   Windows (PowerShell, then open a new terminal):
   ```powershell
   [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")
   $ndk = Get-ChildItem -Name "$env:LocalAppData\Android\Sdk\ndk" | Select-Object -Last 1
   [System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LocalAppData\Android\Sdk\ndk\$ndk", "User")
   ```
   macOS (add to `~/.zshrc`):
   ```sh
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
   ```
3. Add the Android targets to Rust:
   ```sh
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
4. Create the project and the signing key once:
   ```sh
   npm run android:init
   node scripts/android-signing.mjs
   ```
   The key and its password are saved in `src-tauri/gen/android/` (`supsidian.jks` and `keystore.properties`, both git-ignored). **Back them up**: updates must be signed with the same key.
5. Run `npm run android:build`. The APK is at `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`.

---

## Limits

- **iPhone and iPad** aren't supported yet. Tauri can build for iOS, but the vault plugin has no iOS side.
- The macOS app isn't notarized, hence the right-click → **Open** the first time.
