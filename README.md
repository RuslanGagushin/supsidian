# Supsidian apps (Windows, macOS, Android)

The same Supsidian page as `../standalone/supsidian.html`, wrapped with [Tauri 2](https://v2.tauri.app) into native apps:

| Platform | What you get | Vault access |
|---|---|---|
| Windows 10/11 | `.msi` and `-setup.exe` installers (~10 MB, uses the built-in WebView2) | any folder, read and written in place |
| macOS 11+ | `.app` and `.dmg` | any folder, read and written in place |
| Android 7+ | `.apk` | any folder you pick with the system picker (for example `Documents/Obsidian/MyVault`), kept across restarts |

Everything in the web version works the same: board, editor, agenda, calendar, P2P sync. Notes stay plain Markdown files in the vault, so Obsidian sees every change.

## How it is put together

- `scripts/web.mjs` rebuilds `../standalone/supsidian.html` (when `../standalone/node_modules` exists) and copies it to `dist/index.html`. Tauri runs it before every build.
- `tauri-plugin-vault/` is a small plugin for files in the vault: pick the folder, list, read, write, delete.
  - Desktop (`src/desktop.rs`): plain file access. Writes go through a temporary file and a rename, so Obsidian never sees a half-written note.
  - Android (`android/…/VaultPlugin.kt`): the Storage Access Framework. You pick the folder once, and the permission is kept across restarts.
- In the page, `standalone/src/native.js` switches file access to the plugin when it runs inside the app. It also opens `http(s)://` and `obsidian://` links outside the app, and on Android makes the Back button close the editor, menus and dialogs before it leaves the app.
- `src-tauri/` holds the app itself: window settings, permissions in `capabilities/default.json`, and the icons (made from `icon.png`; change that file and run `npm run icons`).

## Build on GitHub (no tools on your computer)

The workflow `.github/workflows/apps.yml` at the top of the repository builds all three apps on GitHub's machines.

1. Put the repository on GitHub (see the steps in the answer, or `git push` if it's already there). It must contain `app/`, `standalone/` and `.github/`.
2. On GitHub, open **Actions**, choose **Build apps**, then **Run workflow**. It takes about 15–25 minutes, or less on later runs thanks to the cache.
3. Open the finished run. Under **Artifacts**, download:
   - **Supsidian-Windows:** the `.msi` and the `-setup.exe`.
   - **Supsidian-macOS:** a universal `.dmg`.
   - **Supsidian-Android:** the `.apk`.
4. For a release, push a tag such as `git tag v0.1.0 && git push --tags`. The same files are then attached to a GitHub Release.

The Android APK is a debug build unless you add two repository secrets (**Settings → Secrets and variables → Actions**). With them, the workflow builds a signed release APK that later versions can update in place:
- `ANDROID_KEYSTORE_BASE64`: the key file as base64. Create it once with `node scripts/android-signing.mjs` after `npm run android:init`, then run `base64 -w0 src-tauri/gen/android/supsidian.jks`, or on Windows `[Convert]::ToBase64String([IO.File]::ReadAllBytes("src-tauri\gen\android\supsidian.jks"))`.
- `ANDROID_KEY_PASSWORD`: the password from `keystore.properties`.

## Build on Windows

1. Install the tools once:
   - **Microsoft C++ Build Tools** (<https://visualstudio.microsoft.com/visual-cpp-build-tools/>), with the workload **Desktop development with C++**.
   - **Rust**: <https://rustup.rs> (run `rustup-init.exe` and accept the defaults).
   - **Node.js 20 or newer**: <https://nodejs.org>.
   - WebView2 is already part of Windows 10 and 11.
2. Build the page once: `cd C:\git\supsidian\standalone` then `npm install`.
3. Build the app:
   ```powershell
   cd C:\git\supsidian\app
   npm install
   npm run build
   ```
   The first build downloads and compiles the Rust crates and takes several minutes. Later builds are much faster.
4. The installers are in `src-tauri\target\release\bundle\`:
   - `msi\Supsidian_0.1.0_x64_en-US.msi`
   - `nsis\Supsidian_0.1.0_x64-setup.exe`

`npm run dev` starts the app without installing it, which is handy for trying changes.

## Build on macOS

1. Install the tools once:
   ```sh
   xcode-select --install                                           # Apple's command-line tools
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh   # Rust
   ```
   You also need Node.js 20 or newer (<https://nodejs.org>, or `brew install node`).
2. Build:
   ```sh
   cd ~/git/supsidian/standalone && npm install
   cd ../app && npm install && npm run build
   ```
3. The app is in `src-tauri/target/release/bundle/`: `macos/Supsidian.app` and `dmg/Supsidian_0.1.0_aarch64.dmg`.

For one build that runs on both Apple Silicon and Intel Macs:
```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

The app isn't signed with an Apple Developer ID. A Mac that built it opens it normally. On another Mac, right-click the app → **Open** the first time.

## Build for Android (on Windows or macOS)

1. Install **Android Studio** (<https://developer.android.com/studio>). Open **Settings → Languages & Frameworks → Android SDK** and install:
   - **SDK Platforms:** Android 16 (API 36).
   - **SDK Tools:** Android SDK Build-Tools, **NDK (Side by side)**, Android SDK Command-line Tools and Android SDK Platform-Tools.
2. Point the build at them.

   Windows (PowerShell; then open a new terminal):
   ```powershell
   [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")
   $ndk = Get-ChildItem -Name "$env:LocalAppData\Android\Sdk\ndk" | Select-Object -Last 1
   [System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LocalAppData\Android\Sdk\ndk\$ndk", "User")
   ```
   macOS (add these lines to `~/.zshrc`):
   ```sh
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
   ```
3. Add the Android targets to Rust:
   ```sh
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
4. Create the Android project once. This makes `src-tauri/gen/android` and puts the app icons in it:
   ```sh
   cd app
   npm install
   npm run android:init
   ```
5. Build an APK. Choose one of these:
   - **Quick, for your own phone:** `npm run tauri android build -- --apk --debug`. The build prints where the APK is. A debug APK is larger and a bit slower, but installs right away.
   - **Signed release (smaller and faster):**
     ```sh
     node scripts/android-signing.mjs   # once: creates the signing key, sets up Gradle
     npm run android:build              # 64-bit ARM, which covers almost every phone
     ```
     The APK is at `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`.

     The script saves the key and its password in `src-tauri/gen/android/` (`supsidian.jks` and `keystore.properties`; both are git-ignored). Back them up: updates must be signed with the same key.
6. Install the APK. Copy it to the phone and open it, allowing installs from that app when Android asks. Or, with USB debugging on, run `adb install -r <path-to-apk>`.

To try it live on a phone connected by USB, run `npm run android:dev`.

**First start on Android:** tap **Open vault folder**, go to the folder of your vault (Obsidian for Android keeps vaults under `Documents/` by default) and tap **Use this folder**, then **Allow**. After that, **Reopen** opens it straight away.

## Good to know

- **Sync and Obsidian:** if Obsidian also runs P2Sidian on the same vault folder, let only one of them sync. The app detects this and offers to stop its own sync (the same guard as in the browser version).
- **Changes from outside:** made in Obsidian, by Obsidian Sync or by Syncthing, they are picked up every few seconds while the app is in front, and whenever you switch back to it.
- **Settings and data:** app settings, fold state and the agenda view are stored per installation. Vault settings (pins, views) stay in `.obsidian/plugins/supsidian/data.json` as before.
- **iPhone/iPad** is not set up. Tauri can build for iOS, but the vault plugin has no iOS side yet.
