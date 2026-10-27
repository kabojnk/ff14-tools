import type { Page } from '@playwright/test'
import { ChatUser, afterDevicesClose, expect, test } from './fixtures'
import { restore, serviceClient } from './supabase'
import { EEP_PASSPHRASE, IDS } from './users'

// Phones (coarse pointer) with a PIN open on the FF14 screen, locked, on every launch and reload. The PIN pad
// waits for the Unlock dot.
// The desktop keeps today's behaviour. Bea has PIN 567890.

afterDevicesClose(async () => {
  await restore()
})

const isPhone = (projectName: string) => projectName === 'webkit-iphone'

/** Records whether the chat composer was ever painted, from the first frame on. */
async function watchForChat(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __chatPainted?: boolean }
    w.__chatPainted = false
    const check = () => {
      const el = document.querySelector<HTMLElement>('[placeholder^="Message #"]')
      if (el && el.offsetParent !== null) w.__chatPainted = true
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

const chatWasPainted = (page: Page) => page.evaluate(() => (window as unknown as { __chatPainted?: boolean }).__chatPainted)

/** A new tab of the same device: shares localStorage (the PIN flag), not sessionStorage. A cold launch. */
async function coldLaunch(user: ChatUser) {
  const page = await user.page.context().newPage()
  await watchForChat(page)
  await page.goto('/')
  return new ChatUser(page, user.user)
}

test.describe('Launch with a PIN', () => {
  test('a device that has had a PIN opens disguised and locked on a phone, on the chat on desktop', async ({ bea }, testInfo) => {
    await bea.page.addInitScript(() => localStorage.setItem('hasPin', '1'))
    await watchForChat(bea.page)
    await bea.page.goto('/')

    if (isPhone(testInfo.project.name)) {
      await expect(bea.eepHeading).toBeVisible()
      // The pad waits for the Unlock dot.
      await expect(bea.unlockDot).toBeVisible()
      await expect(bea.pinDots).toHaveCount(0)
      expect(await chatWasPainted(bea.page)).toBe(false)

      await bea.openPinPad()
      await expect(bea.pinDots.locator('span')).toHaveCount(6)
      await bea.tapPin(bea.user.pin)
      await expect(bea.composer).toBeVisible()
      await expect(bea.eepHeading).toBeHidden()
      // The field mounted hidden behind the disguise; it must still be one full line tall, not squashed.
      await expect.poll(() => bea.page.locator('[data-composer] textarea').evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(30)
    } else {
      await expect(bea.composer).toBeVisible()
      await expect(bea.eepHeading).toBeHidden()
    }
  })

  test('the PIN still unlocks when a frozen old copy of the page holds the session lock', async ({ bea }) => {
    // iOS reloads a page it discarded in the background, and the old copy can stay frozen while holding the
    // browser-wide lock supabase-js used to take. Another tab holding it forever stands in for that copy.
    const old = await bea.page.context().newPage()
    await old.goto('/')
    // supabase-js names the lock after its storage key (sb-<project>-auth-token).
    const lockName = await old.evaluate(() => `lock:${Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k))}`)
    await old.evaluate((name) => {
      void navigator.locks.request(name, () => new Promise(() => {}))
    }, lockName)
    await expect.poll(() => old.evaluate(async (name) => (await navigator.locks.query()).held?.some((l) => l.name === name), lockName)).toBe(true)

    await bea.page.addInitScript(() => localStorage.setItem('hasPin', '1'))
    await bea.page.goto('/')
    await bea.unlockIfLocked()
    await expect(bea.composer).toBeVisible({ timeout: 8_000 })
    await old.close()
  })

  test('after a login on this device, the next launch is locked on a phone and not on desktop', async ({ bea }, testInfo) => {
    await bea.openChat()
    await expect.poll(() => bea.page.evaluate(() => localStorage.getItem('hasPin'))).toBe('1')

    const again = await coldLaunch(bea)
    if (isPhone(testInfo.project.name)) {
      await expect(again.eepHeading).toBeVisible()
      await expect(again.unlockDot).toBeVisible()
      await expect(again.pinDots).toHaveCount(0)
      expect(await chatWasPainted(again.page)).toBe(false)
      await again.openPinPad()
      await again.tapPin(again.user.pin)
      await expect(again.composer).toBeVisible()
    } else {
      await expect(again.composer).toBeVisible()
      await expect(again.eepHeading).toBeHidden()
    }
  })

  test('without a PIN, a stale device flag clears and the next launch opens the chat', async ({ bea }, testInfo) => {
    const svc = serviceClient()
    const pins = await svc.from('private_pins').delete().eq('user_id', IDS.users.bea)
    if (pins.error) throw new Error(pins.error.message)
    const profile = await svc.from('profiles').update({ lock_pin: null, lock_pin_length: null }).eq('id', IDS.users.bea)
    if (profile.error) throw new Error(profile.error.message)

    await bea.openChat()
    expect(await bea.page.evaluate(() => localStorage.getItem('hasPin'))).toBeNull()

    // A flag left behind by a PIN removed elsewhere: the launch is disguised (on phones) until the
    // profile says there is no PIN; then the flag goes and the passphrase opens the chat.
    await bea.page.evaluate(() => localStorage.setItem('hasPin', '1'))
    const stale = await coldLaunch(bea)
    await expect.poll(() => stale.page.evaluate(() => localStorage.getItem('hasPin'))).toBeNull()
    if (isPhone(testInfo.project.name)) {
      await expect(stale.eepHeading).toBeVisible()
      await expect(stale.pinDots).toHaveCount(0)
      await expect(stale.page.getByRole('button', { name: 'Unlock' })).toHaveCount(0)
      await stale.enterPassphrase(EEP_PASSPHRASE)
    }
    await expect(stale.composer).toBeVisible()

    const fresh = await coldLaunch(bea)
    await expect(fresh.composer).toBeVisible()
    await expect(fresh.eepHeading).toBeHidden()
  })
})
