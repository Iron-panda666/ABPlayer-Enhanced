# Build ABPlayer-Enhanced on Windows

This guide creates a local Windows x64 application and installer from the public source. No personal library, profile, API keys or metadata account is needed to build it.

## Prerequisites

- Windows 10 or 11, x64.
- [Git for Windows](https://git-scm.com/downloads/win), or download and extract the repository ZIP instead.
- [Node.js LTS](https://nodejs.org/) with npm.
- [Rust](https://rustup.rs/), using the stable MSVC toolchain.
- Visual Studio with **Desktop development with C++**, the MSVC x64/x86 tools and a Windows SDK selected in Visual Studio Installer. An existing Visual Studio installation with these components is sufficient; separate Build Tools are unnecessary. If you do not have Visual Studio, the standalone C++ Build Tools with the same workload are sufficient.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), normally already installed on current Windows systems.

See the official [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Restart your terminal after installing tools so their commands are available.

## Get the source

Open PowerShell and run:

```powershell
git clone https://github.com/Iron-panda666/ABPlayer-Enhanced.git
cd ABPlayer-Enhanced
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup override set stable-x86_64-pc-windows-msvc
npm ci
```

The Rust override applies to this checkout. It does not change the toolchain used by unrelated projects.

## Check and build

```powershell
npm test
npx svelte-check --threshold error
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis
```

The first native build can take several minutes and downloads Rust dependencies and installer tools. Tauri builds the frontend automatically. See [Tauri's Windows installer documentation](https://v2.tauri.app/distribute/windows-installer/) for additional options.

The outputs are:

- Application: `src-tauri/target/x86_64-pc-windows-msvc/release/ABPlayer-Enhanced.exe`
- Installer: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/ABPlayer-Enhanced_<version>_x64-setup.exe`

The raw build uses the internal Windows installer version. Public packages use the separate upstream/Enhanced release label, such as **1.7.0-Enhanced.1**. See [version naming](VERSIONING.md) and the [release packaging workflow](DISTRIBUTION.md).

For a build without an installer:

```powershell
npm run tauri build -- --target x86_64-pc-windows-msvc --no-bundle
```

Keep any generated runtime DLLs beside the application when copying a raw executable. Use the installer when updating an existing installation so that maintenance, shortcut migration and automatic pre-update backups run.

## Updating an installed copy

Close the player normally, then run your newer installer. It recognizes both **ABPlayer-Enhanced** and the legacy **ABPlayer Fork** installation, reuses the existing folder and preserves the profile in `%APPDATA%\com.ironpanda666.abplayer`. A legacy installation folder can retain its old name; the app and shortcuts use the new name.

Before replacing files, setup creates and verifies a profile archive in `%APPDATA%\com.ironpanda666.abplayer-backups`. It retains the newest **3 automatic backups** and leaves manual backups alone. Backup failure stops the update. Repair preserves the profile; uninstall has a separate option to delete profile data.

This is a manual installer update. There is currently no in-app update checker or automatic download. The original upstream ABPlayer has a separate application identity and an optional first-install profile-copy step.

## Troubleshooting and verification scope

- If `link.exe` or a Windows SDK cannot be found, add the C++ workload and SDK in Visual Studio Installer, restart the terminal and retry.
- If `npm` or `cargo` is not recognized, check the corresponding installation and reopen PowerShell.
- Keep `package-lock.json` and `src-tauri/Cargo.lock`; they record the dependency versions used by the project.
- Local release verification currently uses a Windows GNU toolchain. The MSVC procedure above follows Tauri's documented setup, but has not yet been verified on a clean MSVC machine.

Copyright and distribution conditions are described in the repository's [upstream notices](../README.md#upstream-and-notices). Building a local executable does not grant permission to redistribute it.
