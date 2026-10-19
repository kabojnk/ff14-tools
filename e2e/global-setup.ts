import { execSync } from 'node:child_process'

export default async function globalSetup() {
  try {
    execSync('npx --yes supabase@2 status', { stdio: 'ignore' })
  } catch {
    throw new Error('Local Supabase is not running. Run `npm run db:start` first.')
  }
  if (process.env.E2E_SKIP_RESET !== '1') {
    execSync('npx --yes supabase@2 db reset', { stdio: 'inherit' })
  }
}
