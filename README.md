# Supsidian

**Supsidian shows an Obsidian vault as a board of nested cards, with Org-style TODOs, an agenda, and peer-to-peer sync between your devices.**

Every card is an ordinary Markdown note in your vault. Supsidian adds nothing to your files except the frontmatter it needs to link cards together, so Obsidian, Git, Syncthing and any other tool keep working on the same folder.

This repository wraps the Supsidian page into native apps with [Tauri 2](https://v2.tauri.app):

| Platform | Download | Vault access |
|---|---|---|
| Windows 10/11 | `.msi` or `-setup.exe` (about 10 MB, uses the built-in WebView2) | any folder, read and written in place |
| macOS 11+ | universal `.dmg` (Apple Silicon and Intel) | any folder, read and written in place |
| Android 7+ | `.apk` (64-bit ARM) | any folder you pick with the system picker, kept across restarts |

---

## What it does

### Cards and the board
- **Every note is a card.** A card shows its title, its parents and a preview of its text. The preview length and card height are adjustable.
- **Cards nest, and a card can have several parents.** Parents are listed in a frontmatter property (you choose its name), so one note can sit under *Personal* and under *Documents* at the same time. The breadcrumb, **↑ Go to parent** and the side tree let you move around.
- **Depth control:** show 1, 2 or 3 levels of children, or all of them (`∞`).
- **Board or list layout**, grouping by parent, sorting (manual, or recently modified first), and **saved views** so a board you like is one tap away.
- **Quick capture:** type into *Start typing a new card…* at the top of a board to create a child card there. You can choose a folder for new cards and a **template note** for a card's children.
- **Select mode:** select several cards to move, re-parent or delete them together. **Undo** reverts the last card action.

### Editor
- Markdown editor with a reading view, **full-width** and **focus** modes, and a toolbar for formatting, images and files.
- `[[` or `Ctrl+L` links to another card; `/` opens the insert menu.
- Turn a selection into a **new child card**.

### TODOs and the agenda
- Org-mode style keywords on headings and list items: `TODO`, `NEXT`, `DONE` and the others you configure, with **priorities** and **`SCHEDULED` / `DEADLINE`** dates.
- The **agenda** (calendar icon, or `Ctrl+Shift+K`) collects them from the whole vault by day, with a calendar to jump to a date and a quick-capture form for new entries. Plain checkbox items can be included too.

### Search and filters
- `Ctrl+F` searches the board; filter by tag with `+tag` / `-tag`.
- `Ctrl+O` opens any card by name; `Ctrl+P` opens the command list.

### Sync
- **Peer-to-peer sync between your devices**, with no server and no account: devices share a **sync key** and exchange changes directly.
- The key is compatible with the **P2Sidian** Obsidian plugin, so a phone running Supsidian and a desktop running Obsidian can sync the same vault. If both would sync the same folder, Supsidian notices and offers to stop its own sync.
- Without a key (the `no sync key` button), the app simply edits the folder. External sync (Obsidian Sync, Syncthing, iCloud, Git) works as usual.

### Look and keyboard
- Light and dark themes; English and Russian interface.
- An Emacs-flavoured workbench: a mode line under each board (layout, depth, sort, card count) and a minibuffer with key hints. Most actions have shortcuts. Org-style `C-c` chords work in the editor, for example `C-c C-t` to cycle a TODO state and `C-c C-s` / `C-c C-d` to schedule or set a deadline.
- On phones the layout switches to a single column, the side tree becomes a drawer, and the Android **Back** button closes the editor, menus and dialogs before leaving the app.

---

## Install

### From GitHub
Open the repository's **Releases** page (or the latest **Actions → Build apps** run, under **Artifacts**) and download the file for your platform.

- **Windows:** run the `-setup.exe` or the `.msi`.
- **macOS:** open the `.dmg` and drag Supsidian to Applications. The app is not signed with an Apple Developer ID, so the first time, **right-click the app → Open**.
- **Android:** copy the `.apk` to the phone and open it, allowing installs from that app when Android asks. With USB debugging on, `adb install -r <file>.apk` works too.

### First start
1. Tap **Open vault folder** and choose your vault. On Android, go to the folder (Obsidian for Android keeps vaults under `Documents/` by default), tap **Use this folder**, then **Allow**.
2. After that, **Reopen** opens the same vault straight away.

Want to look around first? **Try the demo vault** loads a sample board in memory; nothing is saved.

---

## Where your data lives

| What | Where |
|---|---|
| Notes (cards) | plain `.md` files in your vault |
| Card parents | a frontmatter property in each note |
| Vault settings: pins, saved views, sync filters | `.obsidian/plugins/supsidian/data.json` in the vault |
| App settings, fold state, agenda view | stored per installation, not in the vault |

**Changes made outside the app**, in Obsidian or by Obsidian Sync or Syncthing, are picked up every few seconds while the app is in front, and whenever you switch back to it. Desktop writes go through a temporary file and a rename, so Obsidian never sees a half-written note.

---

## How the app is put together

```
web/supsidian.html          the whole Supsidian page in one file (copied to dist/index.html)
scripts/web.mjs             prepares dist/index.html before every build
src-tauri/                  the Tauri app: window, permissions (capabilities/default.json), icons
tauri-plugin-vault/         vault file access: pick the folder, list, read, write, delete
  src/desktop.rs            Windows/macOS: plain file access with atomic writes
  android/…/VaultPlugin.kt  Android: Storage Access Framework, plus system-bar insets for the page
.github/workflows/apps.yml  builds all three apps on GitHub
scripts/android-signing.mjs creates an Android signing key and wires it into Gradle
icon.png                    source of every app icon (`npm run icons` regenerates them)
```

`scripts/web.mjs` works in two layouts. Next to a full Supsidian checkout (a `../standalone` folder), it rebuilds `standalone/supsidian.html` and refreshes `web/supsidian.html` from it. On its own, as in this repository, it uses `web/supsidian.html` as is. Inside the app, the page switches its file access to the vault plugin and opens `http(s)://` and `obsidian://` links in the system browser or in Obsidian.

On Android the app draws edge to edge (behind the status bar and gesture bar). The vault plugin measures those bars and pads the page so nothing ends up underneath them.

---

## Build on GitHub (no tools needed on your computer)

1. Push the repository to GitHub.
2. Open **Actions → Build apps → Run workflow**. A run takes about 15–25 minutes, less on later runs thanks to the cache.
3. Download the results from the run's **Artifacts**: **Supsidian-Windows**, **Supsidian-macOS**, **Supsidian-Android**.
4. To publish a release, push a tag: `git tag v0.1.0 && git push --tags`. The same files are attached to a GitHub Release.

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
| `npm run icons` | regenerates every icon from `icon.png` |

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
- Let only one tool sync a given vault folder peer-to-peer: either Supsidian or P2Sidian in Obsidian, not both.
