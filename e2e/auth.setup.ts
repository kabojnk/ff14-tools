import { writeFileSync } from 'node:fs'
import { expect, test as setup } from '@playwright/test'
import { USERS } from './users'

for (const user of Object.values(USERS)) {
  setup(`log in ${user.key}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeHidden()
    await page.waitForFunction(() =>
      Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
    )
    // Without the device PIN flag: each test's devices start as a fresh login, so phones open on the chat.
    // Launch tests add the flag themselves.
    const state = await page.context().storageState()
    for (const origin of state.origins) origin.localStorage = origin.localStorage.filter((e) => e.name !== 'hasPin')
    writeFileSync(user.storageState, JSON.stringify(state, null, 2))
  })
}
