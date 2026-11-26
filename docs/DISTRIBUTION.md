# Windows release packaging

ABPlayer-Enhanced uses GitHub **Releases** for Windows installers and portable downloads. The original author is **Jose Hidalgo (jhidalgo_dev / kurohige)**. Enhanced changes and release maintenance are by **Jiří Veselý, aka Iron-panda666**. The desktop application remains free and available to everyone.

Distribution permission is preserved in [UPSTREAM-PERMISSION.md](../UPSTREAM-PERMISSION.md). The original copyright notice is retained in [LICENSE.txt](../LICENSE.txt); the project is not relabeled with a standard open-source license.

The public release label follows [Enhanced version naming](VERSIONING.md), for example **1.7.0-Enhanced.1**, with tag **v1.7.0-enhanced.1**. The internal Windows build counter remains separate and increasing for compatible updates.

## Maintainer workflow

1. Follow the [Windows build guide](BUILD-WINDOWS.md) and install/cache the locked dependencies.
2. If dependencies change, regenerate notices from the installed packages. For the MSVC build:

   ```powershell
   node scripts/collect-third-party-notices.mjs --target x86_64-pc-windows-msvc
   ```

   The collector includes resolved Cargo dependencies (including build-time packages) and JavaScript runtime dependencies conservatively. It stops if a package has no license text. Supplementary texts and their sources are retained in `licenses/`; exact unmodified Rust crate sources are linked in the generated notices.

3. Before compiling public binaries, remap the build-user directory in Rust diagnostic paths. For PowerShell:

   ```powershell
   $buildUserProfile = [Environment]::GetFolderPath('UserProfile')
   $publicRustFlags = @("--remap-path-prefix=$buildUserProfile=/build/user", "--remap-path-prefix=$($buildUserProfile.Replace('\', '/'))=/build/user")
   $env:CARGO_ENCODED_RUSTFLAGS = $publicRustFlags -join [char]31
   ```

   Build the Windows application and NSIS installer, then run appropriate frontend and installer checks. Changing these flags may require recompiling dependencies. The packaging script rejects a binary that still contains the current user's local directory.
4. Package only the application, loader if required, installer and explicit public notices:

   ```powershell
   .\scripts\package-windows.ps1 -Target x86_64-pc-windows-msvc -OutputDirectory C:\Builds\ABPlayer-Enhanced-release
   ```

5. Inspect both ZIP contents and scan for secrets or profile files. Publish only the three named application downloads and `SHA256SUMS.txt`. Local validation records, profile hashes, recovery files, screenshots of personal libraries and build directories are not release assets.

## Included notices

Both ZIP archives include `LICENSE.txt`, `NOTICE.txt`, `UPSTREAM-PERMISSION.md`, `CHANGELOG.md`, `THIRD-PARTY-NOTICES.txt`, `RELEASE-NOTES.md`, `README.txt` and the `licenses/` directory. The installer also displays the distribution notice and installs legal notices beside the application.

The standalone setup EXE is identical to the EXE in the setup ZIP. The portable archive is installation-free, but uses the normal Enhanced profile. It does not isolate personal listening data from an existing Enhanced installation.

Developed with AI-assisted vibe coding using OpenAI Codex.
