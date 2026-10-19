import { test as base, expect, type Page, type TestInfo, type Browser } from '@playwright/test'
import { EEP_HEADING, USERS, type SeedUser, type UserKey } from './users'
import { stubExternalServices } from './stubs'

export class ChatUser {
  constructor(
    readonly page: Page,
    readonly user: SeedUser,
  ) {}

  get composer() {
    return this.page.getByPlaceholder(/^Message #/)
  }

  get eepHeading() {
    return this.page.getByRole('heading', { name: EEP_HEADING })
  }

  get pinDots() {
    return this.page.getByTestId('pin-dots')
  }

  message(text: string) {
    return this.page.getByText(text, { exact: true })
  }

  /** Opens the chat on the seeded `general` channel and waits for its realtime channel to join. */
  async openChat() {
    await this.page.goto('/')
    // Mobile opens on the channel list; on desktop the button is in the sidebar. Either way, select it.
    await this.page.getByRole('button', { name: 'general', exact: true }).filter({ visible: true }).first().click()
    await expect(this.composer).toBeVisible()
    await expect(this.page.locator('[data-realtime="SUBSCRIBED"]')).toBeAttached()
  }

  async send(text: string) {
    await this.composer.fill(text)
    await this.composer.press('Enter')
  }

  async enterPassphrase(passphrase: string) {
    await this.page.getByLabel('Or enter in a custom raid').fill(passphrase)
    await this.page.getByRole('button', { name: 'Add' }).click()
  }

  async openPinPad() {
    await this.page.getByRole('button', { name: 'Unlock' }).click()
    await expect(this.pinDots).toBeVisible()
  }

  /** Taps PIN keys one at a time, like a person would. */
  async tapPin(pin: string) {
    for (const d of pin) await this.page.locator(`[data-pin-key="${d}"]`).dispatchEvent('pointerdown')
  }

  /** Fires every key's pointerdown synchronously in one task: faster than any human. */
  async fastPin(pin: string) {
    await this.page.evaluate((digits) => {
      for (const d of digits) {
        document
          .querySelector(`[data-pin-key="${d}"]`)!
          .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      }
    }, pin)
  }

  /** Simulates iOS sending the app to the background (visibilitychange → pagehide). */
  async background() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    })
  }

  /** Simulates returning to the app (visibilitychange → pageshow). */
  async foreground() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
  }
}

async function openUser(browser: Browser, testInfo: TestInfo, key: UserKey) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    storageState: USERS[key].storageState,
  })
  await stubExternalServices(context)
  const page = await context.newPage()
  return { context, user: new ChatUser(page, USERS[key]) }
}

type Fixtures = {
  alice: ChatUser
  bea: ChatUser
  /** Opens another device (context) for the same user. For multi-device tests in sub-project 3. */
  secondDevice: (key: UserKey) => Promise<ChatUser>
}

export const test = base.extend<Fixtures>({
  alice: async ({ browser }, use, testInfo) => {
    const { context, user } = await openUser(browser, testInfo, 'alice')
    await use(user)
    await context.close()
  },
  bea: async ({ browser }, use, testInfo) => {
    const { context, user } = await openUser(browser, testInfo, 'bea')
    await use(user)
    await context.close()
  },
  secondDevice: async ({ browser }, use, testInfo) => {
    const contexts: { close: () => Promise<void> }[] = []
    await use(async (key) => {
      const { context, user } = await openUser(browser, testInfo, key)
      contexts.push(context)
      return user
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

export { expect }
