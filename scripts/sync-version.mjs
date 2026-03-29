import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const checkOnly = process.argv.includes('--check');

const filePaths = {
  packageJson: path.join(rootDir, 'package.json'),
  packageLock: path.join(rootDir, 'package-lock.json'),
  tauriConfig: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
  cargoToml: path.join(rootDir, 'src-tauri', 'Cargo.toml'),
};

function updateJsonVersion(content, version) {
  const data = JSON.parse(content);
  if (data.version === version) {
    return content;
  }

  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

function updateCargoVersion(content, version) {
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = /\r?\n$/.test(content);
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;
  let changed = false;

  if (hasTrailingNewline) {
    lines.pop();
  }

  const updatedLines = lines.map((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine === '[package]') {
      inPackageSection = true;
      return line;
    }

    if (trimmedLine.startsWith('[') && trimmedLine !== '[package]') {
      inPackageSection = false;
    }

    if (inPackageSection && /^version\s*=\s*"/.test(trimmedLine)) {
      changed = true;
      return line.replace(/^\s*version\s*=\s*"[^"]*"/, `version = "${version}"`);
    }

    return line;
  });

  if (!changed) {
    throw new Error('Cannot find [package] version field in Cargo.toml');
  }

  return `${updatedLines.join(lineEnding)}${hasTrailingNewline ? lineEnding : ''}`;
}

async function syncFile(filePath, nextContent) {
  const currentContent = await readFile(filePath, 'utf8');
  if (currentContent === nextContent) {
    return false;
  }

  if (!checkOnly) {
    await writeFile(filePath, nextContent, 'utf8');
  }

  return true;
}

async function main() {
  const packageJson = JSON.parse(await readFile(filePaths.packageJson, 'utf8'));
  const version = packageJson.version;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('package.json is missing a valid version field');
  }

  const packageLockContent = await readFile(filePaths.packageLock, 'utf8');
  const tauriConfigContent = await readFile(filePaths.tauriConfig, 'utf8');
  const cargoTomlContent = await readFile(filePaths.cargoToml, 'utf8');

  const nextPackageLockContent = updateJsonVersion(packageLockContent, version);
  const nextTauriConfigContent = updateJsonVersion(tauriConfigContent, version);
  const nextCargoTomlContent = updateCargoVersion(cargoTomlContent, version);

  const changes = [];

  if (await syncFile(filePaths.packageLock, nextPackageLockContent)) {
    changes.push('package-lock.json');
  }

  if (await syncFile(filePaths.tauriConfig, nextTauriConfigContent)) {
    changes.push('src-tauri/tauri.conf.json');
  }

  if (await syncFile(filePaths.cargoToml, nextCargoTomlContent)) {
    changes.push('src-tauri/Cargo.toml');
  }

  if (checkOnly && changes.length > 0) {
    throw new Error(`Version drift detected in: ${changes.join(', ')}`);
  }

  if (!checkOnly) {
    if (changes.length === 0) {
      console.log(`Version already synchronized at ${version}`);
    } else {
      console.log(`Synchronized version ${version} in: ${changes.join(', ')}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});