import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'pack', '--dry-run', '--ignore-scripts', '--json',
], { cwd: root, encoding: 'utf8' })

assert.equal(packed.status, 0, packed.error?.message || packed.stderr || 'npm pack --dry-run failed')
const jsonStart = packed.stdout.search(/\[\s*\{\s*"id"\s*:/)
assert.notEqual(jsonStart, -1, `npm pack --dry-run returned no JSON manifest:\n${packed.stdout}`)
const [manifest] = JSON.parse(packed.stdout.slice(jsonStart))
assert.ok(manifest, 'npm pack --dry-run returned no manifest')

const files = new Set(manifest.files.map(file => file.path.replaceAll('\\', '/')))
for (const required of [
  'package.json',
  'README.md',
  'README.zh.md',
  'LICENSE',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/index.d.ts',
  'lib/client.js',
  'lib/invariant.js',
  'lib/invariant.d.ts',
  'deploy/searxng/compose.yml',
  'deploy/searxng/settings.yml',
  'docs/agent-installation.md',
  'examples/gemini.patch.yml',
]) {
  assert.ok(files.has(required), `package is missing ${required}`)
}

for (const file of files) {
  assert.ok(!file.startsWith('src/'), `source file leaked into package: ${file}`)
  assert.ok(!file.startsWith('tests/'), `test file leaked into package: ${file}`)
  assert.ok(!file.endsWith('.env'), `environment file leaked into package: ${file}`)
}

const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
assert.match(patch, /searchProvider: configurable-search/)
assert.match(patch, /name: dsh-web-search-multi/)

process.stdout.write(`PASS package contents (${String(files.size)} files)\n`)
