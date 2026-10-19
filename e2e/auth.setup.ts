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
    await page.context().storageState({ path: user.storageState })
  })
}
