import { test as base, expect, type Page, type TestInfo, type Browser } from '@playwright/test'
import { EEP_HEADING, USERS, type SeedUser, type UserKey } from './users'
import { stubExternalServices } from './stubs'

export type SpaceName = 'Main' | 'Schist'
export type InfoTabName = 'Media' | 'Pins' | 'Search'

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

  /** The Main or Schist entry in the space list (sidebar on desktop, the Spaces screen on mobile). */
  spaceButton(name: SpaceName) {
    return this.page.locator(`[data-space="${name.toLowerCase()}"]`).filter({ visible: true }).first()
  }

  /** Loads the app and opens a space (Main by default), waiting for the realtime channel to join. */
  async openChat(space: SpaceName = 'Main') {
    await this.page.goto('/')
    await this.openSpace(space)
  }

  /** Switches to a space without reloading. On mobile it goes back to the Spaces screen first. */
  async openSpace(name: SpaceName) {
    const back = this.page.getByRole('button', { name: 'Back to spaces' }).filter({ visible: true })
    if (!(await this.spaceButton(name).isVisible()) && (await back.count()) > 0) await back.first().click()
    await this.spaceButton(name).click()
    await expect(this.page.getByPlaceholder(`Message #${name}`)).toBeVisible()
    await expect(this.page.locator('[data-realtime="SUBSCRIBED"]')).toBeAttached()
  }

  /** Opens User Settings from the user panel (on mobile, from the Spaces screen). */
  async openSettings() {
    const settings = this.page.getByTitle('User settings').filter({ visible: true })
    if ((await settings.count()) === 0) {
      await this.page.getByRole('button', { name: 'Back to spaces' }).filter({ visible: true }).first().click()
    }
    await settings.first().click()
  }

  /** Opens User Settings on the Security tab (desktop) or screen (mobile: gear → Security). */
  async openSecurity() {
    await this.openSettings()
    const gear = this.page.getByTitle('Settings', { exact: true }).filter({ visible: true })
    if ((await gear.count()) > 0) await gear.first().click()
    await this.page.getByRole('button', { name: 'Security', exact: true }).filter({ visible: true }).first().click()
    await expect(this.page.getByText('App Lock PIN').filter({ visible: true })).toBeVisible()
  }

  /** Opens the info panel of the current space on a tab. */
  async openInfoPanel(tab: InfoTabName) {
    const titles: Record<InfoTabName, string> = { Media: 'Media', Pins: 'Pinned Messages', Search: 'Search Messages' }
    const direct = this.page.getByTitle(titles[tab], { exact: true }).filter({ visible: true })
    if ((await direct.count()) > 0) {
      await direct.first().click()
    } else {
      // Mobile: tapping the space name opens the panel; then pick the tab.
      await this.page.locator('h3').filter({ visible: true }).first().click()
      await this.page.getByRole('button', { name: tab, exact: true }).filter({ visible: true }).first().click()
    }
    await expect(this.page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).first()).toBeVisible()
  }

  /** The member list row for a person (the right panel on desktop, the Members screen on mobile). */
  member(nickname: string) {
    return this.page.locator(`[data-member="${nickname}"]`).filter({ visible: true }).first()
  }

  /** Shows the member list: always open on desktop; the Members tab on mobile. */
  async openMembers() {
    if ((await this.page.locator('[data-member]').filter({ visible: true }).count()) > 0) return
    await this.page.getByRole('button', { name: 'Members', exact: true }).filter({ visible: true }).first().click()
    await expect(this.page.locator('[data-member]').filter({ visible: true }).first()).toBeVisible()
  }

  /** Opens the status picker from the user panel (on mobile, from the Spaces screen). */
  async openStatusPicker() {
    const button = this.page.getByTitle('Set status').filter({ visible: true })
    if ((await button.count()) === 0) {
      await this.page.getByRole('button', { name: 'Spaces', exact: true }).filter({ visible: true }).first().click()
    }
    await button.first().click()
    await expect(this.page.getByRole('heading', { name: 'Set Status' })).toBeVisible()
  }

  /** Drag the Lake from the header's More actions menu. */
  async dragTheLake() {
    await this.page.getByTitle('More actions').filter({ visible: true }).first().click()
    await this.page.getByRole('button', { name: 'Drag the Lake' }).filter({ visible: true }).first().click()
  }

  /** Fill the Lake from Settings → Security (open it first with openSecurity). */
  async fillTheLake(password: string) {
    await this.page.getByLabel('Lake password', { exact: true }).filter({ visible: true }).fill(password)
    await this.page.getByRole('button', { name: 'Fill the Lake' }).filter({ visible: true }).click()
  }

  /** Items in the info panel's media tab (thumbnails, file rows and link rows). */
  get mediaItems() {
    return this.page.locator('[data-media-item]').filter({ visible: true })
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
