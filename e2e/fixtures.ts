import { test as base, expect, type Page, type TestInfo, type Browser, type BrowserContextOptions, type Locator } from '@playwright/test'
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

  /** A message in the open space's list (not its preview in the conversation list). */
  message(text: string) {
    return this.page.locator('[data-realtime]').getByText(text, { exact: true })
  }

  /** The row (bubble, ticks, extras) of a message in the open space's list, by its exact text. */
  messageRow(text: string) {
    return this.page.locator('[data-realtime] [data-message-id]').filter({ has: this.page.getByText(text, { exact: true }) })
  }

  /** Whether this device is in the phone layout (long-press sheet) rather than desktop (hover toolbar). */
  async isPhone() {
    return (await this.page.locator('[data-layout="phone"]').count()) > 0
  }

  /** A finger held on `target` past the long-press delay (pointer events, as on iOS). */
  async longPress(target: Locator) {
    await target.scrollIntoViewIfNeeded()
    await target.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 })
    await this.page.waitForTimeout(600)
    await target.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 })
  }

  /**
   * Opens a message's actions on `target` (the bubble, or one photo in it) and returns where its items
   * are: the long-press sheet on phones (buttons), the hover toolbar's ⋯ menu on desktop (menuitems).
   */
  async openMessageActions(target: Locator): Promise<(name: string) => Locator> {
    if (await this.isPhone()) {
      await this.longPress(target)
      const sheet = this.page.getByRole('dialog', { name: 'Message actions' })
      await expect(sheet).toBeVisible()
      return (name) => sheet.getByRole('button', { name, exact: true })
    }
    await target.hover()
    const row = target.locator('xpath=ancestor-or-self::*[@data-message-id][1]')
    await row.getByRole('toolbar', { name: 'Message actions' }).getByRole('button', { name: 'More actions' }).click()
    const menu = this.page.getByRole('menu', { name: 'More actions' })
    await expect(menu).toBeVisible()
    return (name) => menu.getByRole('menuitem', { name, exact: true })
  }

  /** The scrolling message list of the open space. */
  get messageList() {
    return this.page.locator('[data-realtime]').filter({ visible: true }).first()
  }

  /** The Main or Schist tab (under the header on phones, inline in it on desktop). */
  spaceButton(name: SpaceName) {
    return this.page.getByRole('tab').and(this.page.locator(`[data-space="${name.toLowerCase()}"]`)).filter({ visible: true }).first()
  }

  /** The chat header: the partner, presence, status pill, Eep!, the ⋮ menu. */
  get header() {
    return this.page.locator('[data-chat-header]').filter({ visible: true }).first()
  }

  /** The partner's status pill in the header subline. */
  get headerPill() {
    return this.header.locator('[data-status-pill]')
  }

  /** Opens the partner's profile card from the header (desktop popover, phone sheet) and returns it. */
  async partnerCard() {
    await this.showChat()
    await this.header.getByRole('button', { name: /^View .+'s profile$/ }).click()
    const card = this.page.locator('[data-partner-card]').filter({ visible: true })
    await expect(card).toBeVisible()
    return card
  }

  /** The conversation's row in the conversation list (desktop left column; the phone list screen). */
  get conversationRow() {
    return this.page.locator('[data-conversation]').filter({ visible: true }).first()
  }

  /** Your own row: the desktop left column's top, or the phone list screen's top bar. */
  get meRow() {
    return this.page.locator('[data-me-row]').filter({ visible: true }).first()
  }

  /** Waits for the app to settle on the chat or the disguise; if it's the disguise, unlocks it with the PIN. */
  async unlockIfLocked() {
    await expect(this.page.locator('[data-app-shell]').filter({ visible: true }).or(this.eepHeading).first()).toBeVisible()
    if (!(await this.eepHeading.isVisible())) return
    await this.openPinPad()
    await this.tapPin(this.user.pin)
    await expect(this.eepHeading).toBeHidden()
  }

  /** Loads the app and opens a space (Main by default), waiting for the realtime channel to join. */
  async openChat(space: SpaceName = 'Main') {
    await this.page.goto('/')
    await this.unlockIfLocked()
    await this.openSpace(space)
  }

  /** Phones: from the conversation list into the chat. A no-op when the chat is already showing. */
  async showChat() {
    if ((await this.page.locator('[data-layout="phone"]').count()) === 0) return
    if ((await this.conversationRow.count()) > 0) await this.conversationRow.click()
  }

  /** Phones: back from the chat to the conversation list. A no-op on desktop (the left column). */
  async showList() {
    const back = this.page.getByRole('button', { name: 'Back to chats' }).filter({ visible: true })
    if ((await back.count()) > 0) await back.first().click()
    await expect(this.meRow).toBeVisible()
  }

  /** Switches to a space with the Main|Schist tabs, without reloading (on phones, from the list screen back into the chat first). */
  async openSpace(name: SpaceName) {
    if (!(await this.spaceButton(name).isVisible())) await this.showChat()
    await this.spaceButton(name).click()
    await expect(this.page.getByPlaceholder(`Message #${name}`)).toBeVisible()
    await expect(this.page.locator('[data-realtime="SUBSCRIBED"]')).toBeAttached()
  }

  /** Makes the Main|Schist tabs visible (phones: from the list screen back into the chat). */
  async showSpaces() {
    if (!(await this.spaceButton('Main').isVisible())) await this.showChat()
    await expect(this.spaceButton('Main')).toBeVisible()
  }

  /** The typing bubble ("<name> is typing") at the end of the open space's messages. */
  typing(nickname: string) {
    return this.page.locator('[data-realtime]').getByRole('status', { name: `${nickname} is typing`, exact: true }).filter({ visible: true })
  }

  /** The Settings sheet (phones) or dialog (desktop). */
  get settings() {
    return this.page.getByRole('dialog', { name: 'Settings', exact: true })
  }

  /** Opens Settings from the gear in your row (on phones, the list screen's top bar). */
  async openSettings() {
    await this.showList()
    await this.meRow.getByRole('button', { name: 'User settings', exact: true }).click()
    await expect(this.settings).toBeVisible()
  }

  /** Opens Settings on Security & privacy: the phone row that pushes it, or the desktop nav item. */
  async openSecurity() {
    await this.openSettings()
    await this.settings.getByRole('button', { name: 'Security & privacy', exact: true }).filter({ visible: true }).first().click()
    await expect(this.page.getByText('App Lock PIN').filter({ visible: true })).toBeVisible()
  }

  /** Opens the info panel of the current space on a tab, from the header's ⋮ menu (desktop: the right slide-over; phones: full screen). */
  async openInfoPanel(tab: InfoTabName) {
    const items: Record<InfoTabName, string> = { Media: 'Media, files & links', Pins: 'Pinned messages', Search: 'Search messages' }
    await this.showChat()
    await this.chatMenuItem(items[tab]).then((item) => item.click())
    await expect(this.page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).first()).toBeVisible()
  }

  /** Opens the header's ⋮ menu and returns one of its items. */
  async chatMenuItem(name: string) {
    await this.header.getByRole('button', { name: 'More', exact: true }).click()
    const item = this.page.getByRole('menuitem', { name, exact: true })
    await expect(item).toBeVisible()
    return item
  }

  /** The profile and status editor sheet. */
  get profileEditor() {
    return this.page.getByRole('dialog', { name: 'Profile', exact: true })
  }

  /** Opens the profile and status editor from your avatar (on phones, on the list screen). */
  async openProfileEditor() {
    await this.showList()
    await this.meRow.getByTitle('Set status').click()
    await expect(this.profileEditor.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  }

  /** Drag the Lake from the header's ⋮ menu. */
  async dragTheLake() {
    await this.showChat()
    await (await this.chatMenuItem('Drag the Lake')).click()
  }

  /**
   * Expands a lake row in Settings → Security & privacy ("Fill the Lake" or "Change lake password";
   * open it first with openSecurity) and returns its form's region. A row already open stays open.
   */
  async lakeRow(name: 'Fill the Lake' | 'Change lake password') {
    const row = this.page.locator('button[aria-expanded]').and(this.page.getByRole('button', { name, exact: true })).filter({ visible: true }).first()
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
    const region = this.page.getByRole('region', { name, exact: true }).filter({ visible: true })
    await expect(region).toBeVisible()
    return region
  }

  /** Fill the Lake from Settings → Security & privacy (open it first with openSecurity). */
  async fillTheLake(password: string) {
    const region = await this.lakeRow('Fill the Lake')
    await region.getByLabel('Lake password', { exact: true }).fill(password)
    await region.getByRole('button', { name: 'Fill the Lake', exact: true }).click()
  }

  /** Items in the info panel's media tab (thumbnails, file rows and link rows). */
  get mediaItems() {
    return this.page.locator('[data-media-item]').filter({ visible: true })
  }

  /** The composer's round Send button (Save edit while editing). */
  get sendButton() {
    return this.page.getByRole('button', { name: /^(Send|Save edit)$/ }).filter({ visible: true })
  }

  /**
   * Sends (or saves an edit) the way this layout does: Enter on desktop; the Send button on phones,
   * where Return always adds a newline.
   */
  async submit() {
    if (await this.isPhone()) await this.sendButton.click()
    else await this.composer.press('Enter')
  }

  async send(text: string) {
    await this.composer.fill(text)
    await this.submit()
  }

  async enterPassphrase(passphrase: string) {
    await this.page.getByLabel('Or enter in a custom raid').fill(passphrase)
    await this.page.getByRole('button', { name: 'Add' }).click()
  }

  /** The disguise's Unlock dot (shown once the PIN length has loaded). */
  get unlockDot() {
    return this.page.getByRole('button', { name: 'Unlock' })
  }

  /** Opens the PIN pad from the disguise. It never opens by itself: only the Unlock dot opens it. */
  async openPinPad() {
    await this.unlockDot.click()
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
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    })
  }

  /** Simulates returning to the app (visibilitychange → pageshow). */
  async foreground() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
  }
}

/** A signed-in device (context) for a seeded user, like the project's devices unless `overrides` say otherwise. */
export async function openUser(browser: Browser, testInfo: TestInfo, key: UserKey, overrides: BrowserContextOptions = {}) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    storageState: USERS[key].storageState,
    ...overrides,
  })
  await stubExternalServices(context)
  const page = await context.newPage()
  return { context, user: new ChatUser(page, USERS[key]) }
}

type Fixtures = {
  /** Tasks run after every device of the test has closed. Register them with `afterDevicesClose`. */
  afterDevices: (() => Promise<void>)[]
  alice: ChatUser
  bea: ChatUser
  /** Opens another device (context) for the same user. For multi-device tests in sub-project 3. */
  secondDevice: (key: UserKey) => Promise<ChatUser>
}

export const test = base.extend<Fixtures>({
  // The device fixtures depend on this one, so it is torn down after every context has closed.
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument
  afterDevices: async ({}, use) => {
    const tasks: (() => Promise<void>)[] = []
    await use(tasks)
    for (const task of tasks) await task()
  },
  alice: async ({ browser, afterDevices }, use, testInfo) => {
    void afterDevices
    const { context, user } = await openUser(browser, testInfo, 'alice')
    await use(user)
    await context.close()
  },
  bea: async ({ browser, afterDevices }, use, testInfo) => {
    void afterDevices
    const { context, user } = await openUser(browser, testInfo, 'bea')
    await use(user)
    await context.close()
  },
  secondDevice: async ({ browser, afterDevices }, use, testInfo) => {
    void afterDevices
    const contexts: { close: () => Promise<void> }[] = []
    await use(async (key) => {
      const { context, user } = await openUser(browser, testInfo, key)
      contexts.push(context)
      return user
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

/**
 * Runs `fn` after each test of the file, once all of the test's devices have closed. Restoring the seed
 * while devices are still open fans every write out as realtime events to each of them, which can trip
 * local Realtime's per-second limit and drop the next test's postgres_changes; test.afterEach runs too early.
 */
export function afterDevicesClose(fn: () => Promise<void>) {
  test.beforeEach(({ afterDevices }) => {
    afterDevices.push(fn)
  })
}

export { expect }
