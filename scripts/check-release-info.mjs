import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const info = readJson('release-info.json');
const config = readJson('src-tauri/tauri.conf.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const cargo = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLock = fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8').match(/name = "abplayer"\r?\nversion = "([^"]+)"/)?.[1];
const failures = [];
if (!/^\d+\.\d+\.\d+$/.test(info.upstreamVersion)) failures.push('upstreamVersion must have three numeric components');
if (!/^[a-f0-9]{40}$/.test(info.upstreamCommit)) failures.push('upstreamCommit must identify the exact upstream baseline');
if (!Number.isSafeInteger(info.enhancedRevision) || info.enhancedRevision < 1) failures.push('enhancedRevision must be a positive integer');
if (info.releaseVersion !== `${info.upstreamVersion}-Enhanced.${info.enhancedRevision}`) failures.push('releaseVersion does not match the upstream base and Enhanced revision');
if (info.releaseTag !== `v${info.upstreamVersion}-enhanced.${info.enhancedRevision}`) failures.push('releaseTag does not match the release label');
if (!/^\d+\.\d+\.\d+$/.test(info.installerVersion)) failures.push('installerVersion must have three numeric components');
if ([config.version, pkg.version, lock.version, lock.packages?.['']?.version, cargo, cargoLock].some(v => v !== info.installerVersion)) failures.push('Windows/package/Cargo versions do not match installerVersion');
if (!fs.existsSync(path.join(root, `docs/releases/${info.releaseVersion.toLowerCase()}.md`))) failures.push('release notes for the displayed version are missing');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Release ${info.releaseVersion}; tag ${info.releaseTag}; Windows build ${info.installerVersion}`);
