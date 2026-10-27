import type { Route } from '@playwright/test'
import { afterDevicesClose, expect, test } from './fixtures'
import { restore } from './supabase'
import { EEP_PASSPHRASE } from './users'

// The PIN pad's states around leaving and coming back. The pad opens only from the Unlock dot; leaving the app
// always closes it; on a phone with a PIN, leaving arms the lock (the passphrase then only opens the pad).

afterDevicesClose(async () => {
  await restore()
})

const isPhone = (projectName: string) => projectName === 'webkit-iphone'

test.describe('PIN pad states', () => {
  test('coming back from the background shows the FF14 screen, not the pad', async ({ alice }, testInfo) => {
    await alice.openChat()
    await alice.background()
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()
    await expect(alice.unlockDot).toBeVisible()
    await expect(alice.pinDots).toHaveCount(0)

    await alice.enterPassphrase(EEP_PASSPHRASE)
    if (isPhone(testInfo.project.name)) {
      // A phone that left is locked: the passphrase only opens the pad.
      await expect(alice.pinDots).toBeVisible()
      await expect(alice.composer).toBeHidden()
      await alice.tapPin(alice.user.pin)
    }
    await expect(alice.composer).toBeVisible()
  })

  test('leaving with the pad open closes it; the next pad starts empty and works', async ({ alice }) => {
    await alice.openChat()
    await alice.header.getByRole('button', { name: 'Eep!' }).click()
    await alice.openPinPad()
    await alice.tapPin('12')
    await expect(alice.pinDots).toHaveAttribute('data-filled', '2')

    await alice.background()
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()
    await expect(alice.pinDots).toHaveCount(0)

    await alice.openPinPad()
    await expect(alice.pinDots).toHaveAttribute('data-filled', '0')
    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()
  })

  test('a quick trip away (window blur only) also closes the pad on a phone', async ({ alice }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'phones only: a desktop ignores window blur')
    await alice.openChat()
    await alice.header.getByRole('button', { name: 'Eep!' }).click()
    await alice.openPinPad()
    await alice.page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))
    await alice.page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')))
    await expect(alice.pinDots).toHaveCount(0)
    await expect(alice.eepHeading).toBeVisible()
  })

  test('Cancel closes the pad on a locked launch, which stays locked', async ({ bea }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'phones only: a locked launch')
    await bea.page.addInitScript(() => localStorage.setItem('hasPin', '1'))
    await bea.page.goto('/')
    await bea.openPinPad()
    await bea.page.getByRole('button', { name: 'Cancel' }).click()
    await expect(bea.pinDots).toHaveCount(0)
    await expect(bea.eepHeading).toBeVisible()

    await bea.enterPassphrase(EEP_PASSPHRASE)
    await expect(bea.pinDots).toBeVisible()
    await expect(bea.composer).toBeHidden()
    await bea.tapPin(bea.user.pin)
    await expect(bea.composer).toBeVisible()
  })

  test('a reload with the pad open comes back without it', async ({ alice }) => {
    await alice.openChat()
    await alice.header.getByRole('button', { name: 'Eep!' }).click()
    await alice.openPinPad()
    await alice.page.reload()
    await expect(alice.eepHeading).toBeVisible()
    await expect(alice.unlockDot).toBeVisible()
    await expect(alice.pinDots).toHaveCount(0)
    await alice.openPinPad()
    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()
  })

  test('leaving while the PIN is being checked keeps the app locked, whatever the answer', async ({ alice }) => {
    await alice.openChat()
    await alice.header.getByRole('button', { name: 'Eep!' }).click()

    // Hold the check until after the app has gone to the background and come back.
    const held: Route[] = []
    await alice.page.route('**/rest/v1/rpc/verify_pin', (route) => void held.push(route))
    await alice.openPinPad()
    await alice.tapPin(alice.user.pin)
    await expect(alice.pinDots).toHaveAttribute('data-state', 'verifying')
    await expect.poll(() => held.length).toBe(1)

    await alice.background()
    await alice.foreground()
    await expect(alice.pinDots).toHaveCount(0)
    // The right PIN's answer arrives late: it must not open the chat.
    await held[0].continue()
    await alice.page.unroute('**/rest/v1/rpc/verify_pin')
    await alice.page.waitForTimeout(800)
    await expect(alice.eepHeading).toBeVisible()
    await expect(alice.composer).toBeHidden()

    await alice.openPinPad()
    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()
  })

  test('the chat is gone the moment the page is hidden', async ({ alice }) => {
    await alice.openChat()
    // Checked inside the same task as the event: no frame or microtask in between, as iOS freezes the page after it.
    const shown = await alice.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      const shell = document.querySelector<HTMLElement>('[data-app-shell]')
      return {
        chat: !!shell && shell.offsetParent !== null,
        ff14: [...document.querySelectorAll('h1')].some((h) => h.textContent?.includes('FF14 Random Content')),
      }
    })
    expect(shown).toEqual({ chat: false, ff14: true })
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()
  })
})
