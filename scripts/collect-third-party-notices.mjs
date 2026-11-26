import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/collect-third-party-notices.mjs [--target <Rust target>]');
  console.log('Requires installed npm dependencies and cached Cargo dependencies; runs offline.');
  process.exit(0);
}
const targetIndex = process.argv.indexOf('--target');
const target = targetIndex < 0 ? null : process.argv[targetIndex + 1];
const args = ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--offline', '--format-version', '1'];
if (target) args.push('--filter-platform', target);
const metadata = JSON.parse(execFileSync('cargo', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const packages = [];
const missing = [];
function licenseFiles(dir, depth = 0) {
  if (depth > 2) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isFile() && /^(?:licen[cs]e|notice|copying|copyright|unlicense)(?:[._-].*)?$/i.test(entry.name)) return [file];
    if (entry.isDirectory() && /^(?:licen[cs]es?|legal)$/i.test(entry.name)) return licenseFiles(file, depth + 1);
    return [];
  });
}
function add(kind, name, version, license, repository, authors, dir, explicitFile) {
  const files = licenseFiles(dir);
  if (explicitFile && fs.existsSync(path.join(dir, explicitFile)) && !files.includes(path.join(dir, explicitFile))) files.push(path.join(dir, explicitFile));
  const manual = path.join(root, 'licenses', `${name}-LICENSE.txt`);
  if (!files.length && fs.existsSync(manual)) files.push(manual);
  if (!files.length) missing.push(`${kind}: ${name}@${version} (${license || 'unspecified'})`);
  packages.push({ kind, name, version, license, repository, authors,
    texts: files.sort().map(file => ({ name: path.relative(dir, file).startsWith('..') ? path.basename(file) : path.relative(dir, file).replaceAll('\\', '/'), text: fs.readFileSync(file, 'utf8') })) });
}
// Include resolved Cargo packages conservatively, including build-time dependencies.
for (const pkg of metadata.packages) {
  if (!pkg.source) continue;
  add('Rust', pkg.name, pkg.version, pkg.license, pkg.repository, pkg.authors, path.dirname(pkg.manifest_path), pkg.license_file);
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const seen = new Set();
function npmPackage(name, parent = root) {
  let cursor = parent;
  let dir;
  while (true) {
    const candidate = path.join(cursor, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) { dir = candidate; break; }
    const next = path.dirname(cursor);
    if (next === cursor) throw new Error(`Missing installed runtime package ${name}`);
    cursor = next;
  }
  if (seen.has(dir)) return;
  seen.add(dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  add('JavaScript', pkg.name, pkg.version, pkg.license, repository, author ? [author] : [], dir);
  for (const dependency of Object.keys(pkg.dependencies || {})) npmPackage(dependency, dir);
}
for (const name of new Set([...Object.keys(app.dependencies), 'svelte'])) npmPackage(name);
packages.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const header = `ABPlayer-Enhanced — Third-party notices\n\nThis file preserves license and notice texts from dependency distributions.\nCargo dependencies (including build-time packages) and JavaScript runtime dependencies are listed conservatively; a listing does not imply every component is shipped as executable code.\nAdditional runtime, loader and installer notices are in the licenses directory.\nRegenerate with: node scripts/collect-third-party-notices.mjs${target ? ` --target ${target}` : ''}\n\n`;
const text = packages.map(pkg => [
  '='.repeat(78), `${pkg.kind}: ${pkg.name} ${pkg.version}`, `License expression: ${pkg.license || 'not specified'}`,
  pkg.repository ? `Project: ${pkg.repository}` : '', pkg.authors?.length ? `Authors: ${pkg.authors.join('; ')}` : '',
  pkg.kind === 'Rust' ? `Unmodified source: https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download` : `Package source: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
  ...pkg.texts.map(file => `\n--- ${file.name} ---\n${file.text.trimEnd()}\n`),
].filter(Boolean).join('\n')).join('\n\n');
if (missing.length) {
  console.error(JSON.stringify({ packages: packages.length, missingLicenseTexts: missing }, null, 2));
  process.exitCode = 1;
} else {
  fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), header + text + '\n');
  console.log(JSON.stringify({ packages: packages.length, rustPackages: packages.filter(p => p.kind === 'Rust').length, javascriptPackages: seen.size, missingLicenseTexts: 0 }));
}
