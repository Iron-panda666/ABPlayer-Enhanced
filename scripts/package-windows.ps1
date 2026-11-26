param(
    [string]$Target = 'x86_64-pc-windows-msvc',
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath (Join-Path $repo 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$version = $config.version
$releaseInfo = Get-Content -LiteralPath (Join-Path $repo 'release-info.json') -Raw | ConvertFrom-Json
$publicVersion = $releaseInfo.releaseVersion
if ($version -ne $releaseInfo.installerVersion) { throw 'Release metadata does not match the installer version.' }
$release = Join-Path $repo "src-tauri/target/$Target/release"
$binary = Join-Path $release 'ABPlayer-Enhanced.exe'
$loader = Join-Path $release 'WebView2Loader.dll'
$setup = Join-Path $release "bundle/nsis/ABPlayer-Enhanced_${version}_x64-setup.exe"
if (!(Test-Path -LiteralPath $binary) -or !(Test-Path -LiteralPath $setup)) { throw 'Build both the application and NSIS installer first.' }
if ((Get-Item -LiteralPath $binary).VersionInfo.FileVersion -notlike "$version*") { throw 'Executable version does not match source configuration.' }
$userProfile = [Environment]::GetFolderPath('UserProfile')
$binaryText = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($binary))
if ($binaryText.Contains($userProfile) -or $binaryText.Contains($userProfile.Replace('\','/'))) {
    throw 'Executable contains a local build-user directory. Rebuild with Rust path remapping before public packaging.'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$stage = Join-Path $output ('package-stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$notices = @('LICENSE.txt','NOTICE.txt','UPSTREAM-PERMISSION.md','CHANGELOG.md','THIRD-PARTY-NOTICES.txt')
function Add-Notices([string]$destination, [string]$kind) {
    New-Item -ItemType Directory -Path $destination | Out-Null
    foreach ($name in $notices) { Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $destination }
    Copy-Item -LiteralPath (Join-Path $repo 'licenses') -Destination (Join-Path $destination 'licenses') -Recurse
    $notes = [IO.File]::ReadAllText((Join-Path $repo ('docs/releases/' + $publicVersion.ToLowerInvariant() + '.md')))
    $notes = $notes.Replace('../../UPSTREAM-PERMISSION.md','UPSTREAM-PERMISSION.md').Replace('../../CHANGELOG.md','CHANGELOG.md').Replace('../VERSIONING.md','VERSIONING.md').Replace('../BUILD-WINDOWS.md',('https://github.com/Iron-panda666/ABPlayer-Enhanced/blob/' + $releaseInfo.releaseTag + '/docs/BUILD-WINDOWS.md'))
    [IO.File]::WriteAllText((Join-Path $destination 'RELEASE-NOTES.md'),$notes,[Text.UTF8Encoding]::new($false))
    $versioning = [IO.File]::ReadAllText((Join-Path $repo 'docs/VERSIONING.md')).Replace('../release-info.json',('https://github.com/Iron-panda666/ABPlayer-Enhanced/blob/' + $releaseInfo.releaseTag + '/release-info.json'))
    [IO.File]::WriteAllText((Join-Path $destination 'VERSIONING.md'),$versioning,[Text.UTF8Encoding]::new($false))
    $instructions = if ($kind -eq 'portable') {
        'Extract the entire ZIP before starting ABPlayer-Enhanced.exe. Keep the supplied loader DLL, notices and licenses together. This package uses the normal per-user Enhanced profile; it is not an isolated listening profile.'
    } else {
        'Close the player normally, then run the supplied setup EXE. Updates and repairs preserve the profile and create a verified backup before replacing application files. The three newest automatic archives are retained; manual archives are preserved.'
    }
    @"
ABPlayer $publicVersion — Windows x64 ($kind)
Based on upstream ABPlayer $($releaseInfo.upstreamVersion); Enhanced revision $($releaseInfo.enhancedRevision).
Windows installer/file version: $version. See VERSIONING.md for the numbering transition.

$instructions

Original ABPlayer: Jose Hidalgo (jhidalgo_dev / kurohige).
Enhanced changes: Jiří Veselý, aka Iron-panda666.
Unofficial modified version, shared with the original author's written permission.
The desktop application remains free and available to everyone.

Read LICENSE.txt, NOTICE.txt, UPSTREAM-PERMISSION.md, THIRD-PARTY-NOTICES.txt
and the licenses directory. See RELEASE-NOTES.md and CHANGELOG.md for changes.
Microsoft WebView2 Runtime is required and is installed separately if needed.
Audio files and personal listening profiles are not included.

Developed with AI-assisted vibe coding using OpenAI Codex.
https://github.com/Iron-panda666/ABPlayer-Enhanced
"@ | Set-Content -LiteralPath (Join-Path $destination 'README.txt') -Encoding utf8
}
$portable = Join-Path $stage 'portable'
Add-Notices $portable 'portable'
Copy-Item -LiteralPath $binary -Destination $portable
if (Test-Path -LiteralPath $loader) { Copy-Item -LiteralPath $loader -Destination $portable }
$setupStage = Join-Path $stage 'setup'
Add-Notices $setupStage 'setup'
$standalone = Join-Path $output "ABPlayer-Enhanced_${publicVersion}_x64-setup.exe"
Copy-Item -LiteralPath $setup -Destination $standalone
Copy-Item -LiteralPath $setup -Destination (Join-Path $setupStage ([IO.Path]::GetFileName($standalone)))
$portableZip = Join-Path $output "ABPlayer-Enhanced_${publicVersion}_x64-portable.zip"
$setupZip = Join-Path $output "ABPlayer-Enhanced_${publicVersion}_x64-setup.zip"
Compress-Archive -LiteralPath @(Get-ChildItem -LiteralPath $portable | Select-Object -ExpandProperty FullName) -DestinationPath $portableZip
Compress-Archive -LiteralPath @(Get-ChildItem -LiteralPath $setupStage | Select-Object -ExpandProperty FullName) -DestinationPath $setupZip
Get-FileHash -LiteralPath $standalone,$setupZip,$portableZip -Algorithm SHA256 | ForEach-Object {
    '{0}  {1}' -f $_.Hash.ToLowerInvariant(), [IO.Path]::GetFileName($_.Path)
} | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding utf8
Get-Item -LiteralPath $standalone,$setupZip,$portableZip | Select-Object Name,Length
