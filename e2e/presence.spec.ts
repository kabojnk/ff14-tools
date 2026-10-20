import { afterDevicesClose, expect, openUser, test } from './fixtures'
import { restoreStatuses } from './supabase'

// Going to the background touches Bea's last_seen_at; put her profile back (only if it changed).
afterDevicesClose(async () => {
  await restoreStatuses()
})

test.describe('Presence', () => {
  test('Bea stays online while any of her devices is in the foreground; with both away, Alice sees "last seen"', async ({
    alice,
    bea,
    secondDevice,
  }) => {
    const beaPhone = await secondDevice('bea')
    await bea.openChat()
    await beaPhone.openChat()
    await alice.openChat()
    await alice.showChat()
    const line = alice.header.getByTestId('presence-line')
    await expect(line).toHaveText('online', { timeout: 5_000 })

    // One device goes to the background: the other still counts.
    await bea.background()
    // Give the hidden device's presence change time to arrive, then check it didn't flip Bea offline.
    await alice.page.waitForTimeout(1_500)
    await expect(line).toHaveText('online')

    // Both away: Alice sees when Bea was last here.
    await beaPhone.background()
    await expect(line).toHaveText(/^last seen /, { timeout: 5_000 })

    // Back on one device: online again.
    await beaPhone.foreground()
    await expect(line).toHaveText('online', { timeout: 5_000 })
  })
})

test.describe('Presence after logging in', () => {
  test('a fresh login goes online, and the status picker changes the dot', async ({ browser, bea }, testInfo) => {
    // Not the saved login: this device signs in on the login screen, so the profile arrives after the user.
    const { context, user: alice } = await openUser(browser, testInfo, 'alice', { storageState: undefined })
    try {
      await bea.openChat()
      await alice.page.goto('/')
      await alice.page.getByRole('button', { name: 'Login' }).click()
      await alice.page.getByLabel('Email').fill(alice.user.email)
      await alice.page.getByLabel('Password').fill(alice.user.password)
      await alice.page.getByRole('button', { name: 'Sign In' }).click()
      await expect(alice.page.locator('[data-app-shell]').filter({ visible: true })).toBeVisible()
      await alice.showList()

      const myDot = alice.meRow.locator('[data-presence]')
      const beaSees = bea.header.getByTestId('presence-line')
      await bea.showChat()
      await expect(myDot).toHaveAttribute('data-presence', 'online')
      await expect(beaSees).toHaveText('online', { timeout: 5_000 })

      await alice.meRow.locator('button[title="Set status"]').click()
      await alice.page.getByRole('button', { name: 'Away', exact: true }).click()
      await alice.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(myDot).toHaveAttribute('data-presence', 'away')
      await expect(beaSees).toHaveText('away', { timeout: 5_000 })
    } finally {
      await context.close()
    }
  })
})
