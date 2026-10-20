import { afterDevicesClose, expect, test } from './fixtures'
import { restore } from './supabase'

// Puts the PINs back and deletes the messages sent after unlocking.
afterDevicesClose(async () => {
  await restore()
})

test.describe('PIN lock', () => {
  test('wrong PIN shakes and clears; right PIN opens the chat', async ({ alice }) => {
    await alice.openChat()
    await alice.background()
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()

    await alice.openPinPad()
    await alice.tapPin('9999')
    await expect(alice.pinDots).toHaveAttribute('data-state', 'error')
    await expect(alice.pinDots).toHaveAttribute('data-state', 'idle')
    await expect(alice.pinDots).toHaveAttribute('data-filled', '0')

    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()
  })

  test('sending still works after unlocking (regression)', async ({ alice, bea }) => {
    await alice.openChat()
    await bea.openChat()

    await alice.background()
    await alice.foreground()
    await alice.openPinPad()
    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()

    const text = `after unlock ${Date.now()}`
    await alice.send(text)
    await expect(alice.composer).toHaveValue('')
    await expect(alice.composer).toBeEnabled()
    await expect(alice.message(text)).toBeVisible()
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })
  })

  test('fast entry of a 6-digit PIN registers every digit', async ({ bea }) => {
    await bea.openChat()
    await bea.send('/eep')
    await bea.openPinPad()
    await bea.fastPin(bea.user.pin)
    await expect(bea.composer).toBeVisible()
  })

  test('a 5-digit PIN set in Settings unlocks the app', async ({ alice }) => {
    await alice.openChat()
    await alice.openSecurity()
    await alice.page.getByRole('button', { name: 'Change PIN' }).filter({ visible: true }).click()
    await expect(alice.page.getByRole('dialog', { name: 'Enter Current Passcode' })).toBeVisible()
    await alice.tapPin(alice.user.pin)

    await expect(alice.page.getByRole('dialog', { name: 'Enter New Passcode' })).toBeVisible()
    await alice.page.getByRole('button', { name: 'Passcode Options' }).click()
    await alice.page.getByRole('button', { name: '5-Digit Numeric Code' }).click()
    await alice.tapPin('24680')
    await expect(alice.page.getByRole('dialog', { name: 'Confirm New Passcode' })).toBeVisible()
    await alice.tapPin('24680')
    await expect(alice.page.getByText('PIN changed successfully').filter({ visible: true })).toBeVisible()

    // A reload counts as leaving the app, so it comes back locked, with the length read from the server.
    await alice.page.goto('/')
    await expect(alice.eepHeading).toBeVisible()
    await alice.openPinPad()
    await expect(alice.pinDots.locator('span')).toHaveCount(5)
    await alice.tapPin('24680')
    await alice.openSpace('Main')

    await alice.background()
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()
    await alice.openPinPad()
    await alice.tapPin('13579')
    await expect(alice.pinDots).toHaveAttribute('data-state', 'error')
    await expect(alice.pinDots).toHaveAttribute('data-filled', '0')
    await alice.tapPin('24680')
    await expect(alice.composer).toBeVisible()
  })
})
