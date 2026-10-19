import { expect, test } from '@playwright/test'
import { EEP_HEADING, USERS } from './users'

test.use({ storageState: { cookies: [], origins: [] } })

test('logged-out visitors see the FF14 tool and can log in to the chat', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: EEP_HEADING })).toBeVisible()

  await page.getByRole('button', { name: 'Login' }).click()
  await page.getByLabel('Email').fill(USERS.alice.email)
  await page.getByLabel('Password').fill(USERS.alice.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: EEP_HEADING })).toBeHidden()
  await expect(page.locator('[data-space="main"]').filter({ visible: true }).first()).toBeVisible()
})
