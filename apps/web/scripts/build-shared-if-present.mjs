import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const webRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(webRoot, '../../..');
const sharedPackageJson = resolve(monorepoRoot, 'packages/shared/package.json');

if (!existsSync(sharedPackageJson)) {
  console.log('[AudiDisc] packages/shared no existe en este deploy; se omite build del workspace shared.');
  process.exit(0);
}

const result = spawnSync(
  'npm',
  ['--prefix', monorepoRoot, 'run', 'build', '--workspace', '@audidisc/shared'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

process.exit(result.status ?? 1);
