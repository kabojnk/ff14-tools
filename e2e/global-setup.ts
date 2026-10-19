import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ENV_FILE } from './supabase'

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

export default async function globalSetup() {
  let status: string
  try {
    status = execSync('npx --yes supabase@2 status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('Local Supabase is not running. Run `npm run db:start` first.')
  }
  // Every run, even with E2E_SKIP_RESET=1, so helpers never use stale keys.
  const env = parseEnv(status)
  if (!env.API_URL || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) {
    throw new Error('`supabase status -o env` did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY.')
  }
  mkdirSync('e2e/.auth', { recursive: true })
  writeFileSync(
    ENV_FILE,
    JSON.stringify({ apiUrl: env.API_URL, anonKey: env.ANON_KEY, serviceRoleKey: env.SERVICE_ROLE_KEY }, null, 2),
  )

  if (process.env.E2E_SKIP_RESET !== '1') {
    execSync('npx --yes supabase@2 db reset', { stdio: 'inherit' })
  }
}
