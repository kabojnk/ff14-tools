import { expect, test } from './fixtures'

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
})
