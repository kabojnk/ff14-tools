// Builds the iOS app's web bundle: `vite build --mode native` into dist-native/.
//   node scripts/native-bundle.mjs                   the bundle shipped inside the app (npm run build:native)
//   node scripts/native-bundle.mjs --publish <dir>   also zip it and write <dir>/latest.json (the Docker build)
// Plain JavaScript: the Docker build runs it on Node 20 without TypeScript.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** `<package version>-<UTC YYYYMMDDHHmmss>`. The app only ever updates to a later stamp. */
export function bundleVersion(pkgVersion, now = new Date()) {
  return `${pkgVersion}-${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
}

export function manifestFor({ version, zipName, checksum, minNative }) {
  return { version, url: zipName, checksum, minNative }
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const { minNative } = JSON.parse(readFileSync(path.join(root, 'native-shell.json'), 'utf8'))
  const version = bundleVersion(pkg.version)

  execFileSync(path.join(root, 'node_modules/.bin/vite'), ['build', '--mode', 'native'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BUNDLE_VERSION: version },
  })

  const at = argv.indexOf('--publish')
  if (at === -1) {
    console.log(`native bundle ${version} in dist-native/`)
    return
  }
  const out = path.resolve(root, argv[at + 1] ?? 'dist/native')
  mkdirSync(out, { recursive: true })
  const zipName = `bundle-${version}.zip`
  const zipPath = path.join(out, zipName)
  rmSync(zipPath, { force: true })
  // index.html must sit at the zip's root (the updater requires it). -X leaves out extra file attributes.
  execFileSync('zip', ['-qrX', zipPath, '.'], { cwd: path.join(root, 'dist-native'), stdio: 'inherit' })
  const checksum = sha256(readFileSync(zipPath))
  writeFileSync(path.join(out, 'latest.json'), `${JSON.stringify(manifestFor({ version, zipName, checksum, minNative }), null, 2)}\n`)
  console.log(`published native bundle ${version} (${checksum}) to ${path.relative(root, out)}/`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
