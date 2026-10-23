import { randomUUID } from 'node:crypto'
import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS, LAKE_PASSWORD } from './users'

const created: string[] = []

afterDevicesClose(async () => {
  if (created.length) {
    const { error } = await serviceClient().from('messages').delete().in('id', created.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

function chip(user: ChatUser, name: string) {
  return user.page.getByRole('button', { name, exact: true }).filter({ visible: true })
}

function extensionBox(user: ChatUser) {
  return user.page.getByPlaceholder('extension, e.g. zip').filter({ visible: true })
}

/** Stands in for an upload: Bea posts an image in Schist, in the current session. Returns the message id. */
async function beaPostsImageInSchist() {
  const id = randomUUID()
  const { error } = await serviceClient().from('messages').insert({
    id,
    conversation_id: IDS.conversation,
    space: 'schist',
    session_id: IDS.sessions.current,
    author_id: IDS.users.bea,
    content: null,
    attachments: [
      { url: 'http://cdn.test.local/media/schist-shot.png', type: 'image', filename: 'schist-shot.png', size: 3072, spoiler: false },
    ],
    type: 'text',
  })
  if (error) throw new Error(error.message)
  created.push(id)
  return id
}

/** An old Main message from Bea (two days ago) with `fillers` newer messages after it, so the list must page back to it. */
async function oldMessageBehind(fillers: number) {
  const content = `Jump target ${randomUUID().slice(0, 8)}`
  const now = Date.now()
  const row = (content: string, at: number) => ({
    id: randomUUID(),
    conversation_id: IDS.conversation,
    space: 'main',
    session_id: IDS.sessions.current,
    author_id: IDS.users.bea,
    content,
    attachments: [],
    type: 'text',
    created_at: new Date(at).toISOString(),
  })
  const target = row(content, now - 2 * 86_400_000)
  // Newer than the seed, so the first page holds only fillers.
  const rows = [target, ...Array.from({ length: fillers }, (_, i) => row(`Filler ${i}`, now - 30_000 + i * 10))]
  const { error } = await serviceClient().from('messages').insert(rows)
  if (error) throw new Error(error.message)
  created.push(...rows.map((r) => r.id))
  return { id: target.id, content }
}

const row = (user: ChatUser, id: string) => user.page.locator(`[data-realtime] [data-message-id="${id}"]`)
const viewer = (user: ChatUser) => user.page.getByRole('dialog', { name: 'Media viewer' })

test.describe('Media gallery', () => {
  test('the extension filter ignores dots and case', async ({ alice }) => {
    await alice.openChat()
    await alice.openInfoPanel('Media')
    await chip(alice, 'Files').click()
    await expect(alice.mediaItems).toHaveCount(2) // raid.PMP and notes.zip

    for (const ext of ['pmp', '.pmp', 'PMP']) {
      await extensionBox(alice).fill(ext)
      await expect(alice.mediaItems).toHaveCount(1)
      await expect(alice.mediaItems.first()).toContainText('raid.PMP')
    }
    // Fewer than 3 matches: a header over them, and recent files without the filter, dimmed and not counted.
    await expect(alice.page.getByText('1 file · .pmp').filter({ visible: true })).toBeVisible()
    await expect(alice.page.getByText('Without the filter').filter({ visible: true })).toBeVisible()
    await expect(alice.page.locator('[data-media-fallback]').filter({ visible: true })).toContainText('notes.zip')

    // From All, an extension searches every kind.
    await chip(alice, 'All').click()
    await extensionBox(alice).fill('zip')
    await expect(alice.mediaItems).toHaveCount(1)
    await expect(alice.mediaItems.first()).toContainText('notes.zip')

    await alice.page.getByRole('button', { name: 'Clear extension' }).click()
    await expect(extensionBox(alice)).toHaveValue('')
    await expect(alice.mediaItems).toHaveCount(3) // image, video, gif
  })

  test('Links lists the site, address and sender, and opens in a new tab', async ({ alice }) => {
    await alice.openChat()
    await alice.openInfoPanel('Media')
    await chip(alice, 'Links').click()
    await expect(alice.mediaItems).toHaveCount(1)
    const link = alice.mediaItems.first()
    await expect(link).toContainText('example.com')
    await expect(link).toContainText('example.com/guide · Bea · ')
    await expect(link).toHaveAttribute('href', 'https://example.com/guide')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    await chip(alice, 'Voice').click()
    await expect(alice.page.getByText('No voice memos yet')).toBeVisible()
  })

  test('Drag the Lake hides the media and Fill brings it back', async ({ alice, secondDevice }) => {
    const back = alice.page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true })
    await alice.openChat()
    await alice.openInfoPanel('Media')
    await expect(alice.mediaItems).toHaveCount(3)
    await back.click()

    await alice.dragTheLake()
    await expect(alice.message('Seed: hi Bea')).toHaveCount(0)
    await alice.openInfoPanel('Media')
    await expect(alice.page.getByText('No media in this space yet.')).toBeVisible()
    await expect(alice.mediaItems).toHaveCount(0)
    await back.click()

    // Fill from Alice's other device (a reload here would land on the disguise).
    const settings = await secondDevice('alice')
    await settings.openChat()
    await settings.openSecurity()
    await settings.fillTheLake(LAKE_PASSWORD)
    await expect(settings.page.getByText('Lake filled.', { exact: true }).filter({ visible: true })).toBeVisible()

    await alice.openInfoPanel('Media')
    await expect(alice.mediaItems).toHaveCount(3)
  })

  test('Both counts both spaces; This space only the open one', async ({ alice }) => {
    await beaPostsImageInSchist()
    await alice.openChat('Schist')
    await alice.openInfoPanel('Media')
    await expect(alice.mediaItems).toHaveCount(1)
    await expect(alice.mediaItems.locator('img[alt="schist-shot.png"]')).toBeVisible()

    await chip(alice, 'Both').click()
    await expect(alice.mediaItems).toHaveCount(4)

    await chip(alice, 'This space').click()
    await expect(alice.mediaItems).toHaveCount(1)
  })

  test('Show in chat from Both switches to Schist and flashes the message', async ({ alice }) => {
    const id = await beaPostsImageInSchist()
    await alice.openChat('Main')
    // A reply started in Main must not follow the jump into Schist.
    const item = await alice.openMessageActions(alice.messageRow('Seed: hi Bea').locator('[data-bubble]'))
    await item('Reply').click()
    await expect(alice.page.getByText('Replying to').filter({ visible: true })).toBeVisible()
    await alice.openInfoPanel('Media')
    await chip(alice, 'Both').click()
    await expect(alice.mediaItems).toHaveCount(4)
    await alice.mediaItems.filter({ has: alice.page.locator('img[alt="schist-shot.png"]') }).click()

    const v = viewer(alice)
    await expect(v).toBeVisible()
    await expect(v.getByText('Bea', { exact: true })).toBeVisible()
    await expect(v.getByText(/^Schist · /)).toBeVisible()
    await v.getByRole('button', { name: 'Show in chat' }).click()

    await expect(v).toBeHidden()
    await expect(alice.spaceButton('Schist')).toHaveAttribute('aria-selected', 'true')
    await expect(row(alice, id)).toHaveClass(/msg-flash/)
    await expect(alice.page.getByText('Replying to')).toHaveCount(0)
    // Desktop keeps the panel open, following the space; phones close it to show the chat.
    const panelTitle = alice.page.getByRole('heading', { name: 'Schist', exact: true })
    if (await alice.isPhone()) await expect(panelTitle).toBeHidden()
    else await expect(panelTitle).toBeVisible()
  })

  test('the viewer counts the loaded photos and moves with the arrows or a swipe', async ({ alice }) => {
    await alice.openChat('Main')
    await alice.openInfoPanel('Media')
    await expect(alice.mediaItems).toHaveCount(3)
    await alice.mediaItems.first().click()
    const v = viewer(alice)
    const count = v.getByTestId('viewer-count')
    await expect(count).toHaveText('1 of 3')
    await expect(v.getByRole('button', { name: 'Previous' })).toBeDisabled()

    if (await alice.isPhone()) {
      const stage = v.locator('[data-viewer-stage]')
      const box = (await stage.boundingBox())!
      const y = box.y + box.height / 2
      const swipe = { pointerType: 'touch', isPrimary: true, pointerId: 7, button: 0 }
      await stage.dispatchEvent('pointerdown', { ...swipe, clientX: box.x + box.width * 0.8, clientY: y })
      await stage.dispatchEvent('pointerup', { ...swipe, clientX: box.x + box.width * 0.2, clientY: y })
    } else {
      await v.getByRole('button', { name: 'Next' }).click()
    }
    await expect(count).toHaveText('2 of 3')
    await alice.page.keyboard.press('ArrowRight')
    await expect(count).toHaveText('3 of 3')
    await expect(v.getByRole('button', { name: 'Next' })).toBeDisabled()
    await v.getByRole('button', { name: 'Close' }).click()
    await expect(v).toBeHidden()
  })

  test('a search result pages back to an old message and flashes it', async ({ alice }) => {
    const target = await oldMessageBehind(60)
    await alice.openChat('Main')
    await expect(row(alice, target.id)).toHaveCount(0) // not on the first page
    await alice.openInfoPanel('Search')
    const box = alice.page.getByPlaceholder('Search messages…').filter({ visible: true })
    await box.fill(target.content)
    await box.press('Enter')
    await alice.page.getByRole('button', { name: new RegExp(target.content) }).filter({ visible: true }).click()

    await expect(row(alice, target.id)).toHaveClass(/msg-flash/)
    await expect(row(alice, target.id)).toBeInViewport()
  })

  test('a pinned message jumps to its row', async ({ alice }) => {
    await alice.openChat('Main')
    await alice.openInfoPanel('Pins')
    // In the panel: the conversation list's row also shows the newest message, Seed: pinned note.
    await alice.page.locator('[data-pin-card]').getByRole('button', { name: /Seed: pinned note/ }).filter({ visible: true }).click()
    await expect(alice.messageRow('Seed: pinned note')).toHaveClass(/msg-flash/)
  })
})
