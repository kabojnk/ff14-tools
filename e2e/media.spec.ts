import { randomUUID } from 'node:crypto'
import { expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS, LAKE_PASSWORD } from './users'

const created: string[] = []

test.afterEach(async () => {
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
  return user.page.getByPlaceholder('Extension (e.g. zip)').filter({ visible: true })
}

/** Stands in for an upload: Bea posts an image in Schist, in the current session. */
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
}

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

    // From All, an extension searches every kind.
    await chip(alice, 'All').click()
    await extensionBox(alice).fill('zip')
    await expect(alice.mediaItems).toHaveCount(1)
    await expect(alice.mediaItems.first()).toContainText('notes.zip')

    await alice.page.getByRole('button', { name: 'Clear extension' }).click()
    await expect(extensionBox(alice)).toHaveValue('')
    await expect(alice.mediaItems).toHaveCount(3) // image, video, gif
  })

  test('Links lists the host and opens in a new tab', async ({ alice }) => {
    await alice.openChat()
    await alice.openInfoPanel('Media')
    await chip(alice, 'Links').click()
    await expect(alice.mediaItems).toHaveCount(1)
    const link = alice.mediaItems.first()
    await expect(link).toContainText('example.com')
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
})
