// Bundles each tests/*.test.mjs with esbuild (aliasing native modules to stubs) and runs them with node --test.
import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'tests', '.build');
mkdirSync(out, { recursive: true });
const files = readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.mjs'));
await build({
  entryPoints: files.map((f) => path.join(root, 'tests', f)),
  outdir: out, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' },
  external: ['node:*'],
  loader: { '.js': 'jsx' },
  alias: {
    'expo-sqlite': path.join(root, 'tests/stubs/expo-sqlite.js'),
    'react-native': path.join(root, 'tests/stubs/react-native.js'),
    'expo-sharing': path.join(root, 'tests/stubs/expo-sharing.js'),
  },
  plugins: [{ name: 'native-stub', setup(b) { b.onResolve({ filter: /modules\/reminder-native$/ }, () => ({ path: path.join(root, 'tests/stubs/reminder-native.js') })); } }],
  logLevel: 'warning',
});
const r = spawnSync('node', ['--test', '--no-warnings', ...files.map((f) => path.join(out, f))], { stdio: 'inherit' });
process.exit(r.status ?? 1);
