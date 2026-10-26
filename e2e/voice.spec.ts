import { randomUUID } from 'node:crypto'
import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { EEP_PASSPHRASE, IDS } from './users'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const PEAKS = Array.from({ length: 48 }, (_, i) => Math.round(50 + 45 * Math.sin(i / 3)))
const created: string[] = []

afterDevicesClose(async () => {
  const svc = serviceClient()
  if (created.length) {
    const { error } = await svc.from('messages').delete().in('id', created.splice(0))
    if (error) throw new Error(error.message)
  }
  // Memos recorded in the tests.
  const { error } = await svc.from('messages').delete().eq('author_id', IDS.users.alice).contains('attachments', JSON.stringify([{ type: 'audio' }]))
  if (error) throw new Error(error.message)
  await restore()
})

/**
 * The fixture format a browser can surely play. Playwright's Chromium on Linux (CI) may lack the AAC
 * decoder (it's a platform codec on macOS and Windows), so Chromium gets the WebM/Opus copy.
 */
const voiceExt = (browserName: string) => (browserName === 'chromium' ? 'webm' : 'm4a')

/** Stands in for a memo Bea sent: 4 s, in Main, in the current session. */
async function beaVoiceMemo(browserName: string) {
  const id = randomUUID()
  const ext = voiceExt(browserName)
  const { error } = await serviceClient().from('messages').insert({
    id,
    conversation_id: IDS.conversation,
    space: 'main',
    session_id: IDS.sessions.current,
    author_id: IDS.users.bea,
    content: null,
    attachments: [{ url: `http://cdn.test.local/voice/${id}.${ext}`, type: 'audio', filename: `voice-${id}.${ext}`, size: 24156, spoiler: false, duration_ms: 4000, peaks: PEAKS }],
    type: 'text',
  })
  if (error) throw new Error(error.message)
  created.push(id)
  return id
}

async function aliceAudioCount() {
  const { count, error } = await serviceClient()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', IDS.users.alice)
    .contains('attachments', JSON.stringify([{ type: 'audio' }]))
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Uploads answer with a voice URL (the CDN stub serves the fixture there). */
async function stubVoiceUpload(user: ChatUser, browserName: string) {
  const ext = voiceExt(browserName)
  await user.page.route('**/functions/v1/upload-media**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: { url: `http://cdn.test.local/voice/${randomUUID()}.${ext}`, filename: `voice-e2e.${ext}`, type: `audio/${ext === 'webm' ? 'webm' : 'mp4'}`, size: 24156 },
          headers: CORS,
        }),
  )
}

const memoBubble = (user: ChatUser, id?: string) =>
  id ? user.messageList.locator(`[data-message-id="${id}"] [data-voice-bubble]`) : user.messageList.locator('[data-voice-bubble]').last()

test.describe('Voice memos', () => {
  test('Alice records on desktop; Bea sees it live, plays it, and Alice sees it played', async ({ alice, bea, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can fake a microphone')
    await stubVoiceUpload(alice, browserName)
    await alice.openChat()
    await bea.openChat()

    await alice.page.getByRole('button', { name: 'Record a voice message' }).click()
    await expect(alice.page.getByRole('button', { name: 'Stop and preview' })).toBeVisible()
    await expect(bea.page.getByRole('status', { name: 'Alice is recording a voice message' })).toBeVisible()
    await alice.page.waitForTimeout(1500)
    await alice.page.getByRole('button', { name: 'Send voice message' }).click()
    await expect(alice.page.getByRole('button', { name: 'Record a voice message' })).toBeVisible()

    const theirs = memoBubble(bea)
    await expect(theirs.getByRole('img', { name: 'Not played yet' })).toBeVisible()
    await theirs.getByRole('button', { name: 'Play voice message' }).click()
    await expect(theirs.getByRole('img', { name: 'Not played yet' })).toHaveCount(0)
    await expect(memoBubble(alice).getByRole('img', { name: 'Played' })).toBeVisible()
  })

  test('the disguise mid-recording discards it', async ({ alice, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium can fake a microphone')
    await stubVoiceUpload(alice, browserName)
    await alice.openChat()
    const before = await aliceAudioCount()
    await alice.page.getByRole('button', { name: 'Record a voice message' }).click()
    await expect(alice.page.getByRole('button', { name: 'Stop and preview' })).toBeVisible()

    await alice.header.getByRole('button', { name: 'Eep!' }).click()
    await expect(alice.eepHeading).toBeVisible()
    await alice.enterPassphrase(EEP_PASSPHRASE)

    await expect(alice.page.getByRole('button', { name: 'Record a voice message' })).toBeVisible()
    await expect(alice.page.getByRole('button', { name: 'Stop and preview' })).toHaveCount(0)
    expect(await aliceAudioCount()).toBe(before)
  })

  test('a short tap hints "Hold to record" and sends nothing', async ({ alice }) => {
    await alice.openChat()
    // Playwright's WebKit on Linux (CI) has no usable MediaRecorder, so the composer rightly offers no mic.
    const canRecord = await alice.page.evaluate(() => typeof MediaRecorder !== 'undefined' && ['audio/mp4', 'audio/webm'].some((t) => MediaRecorder.isTypeSupported(t)))
    test.skip(!canRecord, 'this browser cannot record, so there is no mic button')
    const before = await aliceAudioCount()
    // The same element throughout: once pressed, its label changes to "Release to send".
    const mic = await alice.page.getByRole('button', { name: 'Record a voice message' }).elementHandle()
    await mic!.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0, pointerId: 7 })
    await mic!.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0, pointerId: 7 })
    // WebKit has no (fake) microphone: its refusal can arrive first, and its hint is just as right.
    await expect(
      alice.page.locator('[data-composer] [role="status"]').filter({ hasText: /^(Hold to record|Microphone access is off|No microphone found|Couldn't start recording)/ }),
    ).toBeVisible()
    expect(await aliceAudioCount()).toBe(before)
  })

  test("a memo plays, shows its position, and is marked played", async ({ alice, browserName }) => {
    const id = await beaVoiceMemo(browserName)
    await alice.openChat()
    const memo = memoBubble(alice, id)
    await expect(memo.getByText('0:04', { exact: true })).toBeVisible()
    await expect(memo.getByRole('img', { name: 'Not played yet' })).toBeVisible()

    await memo.getByRole('button', { name: 'Play voice message' }).click()
    await expect(memo.getByRole('img', { name: 'Not played yet' })).toHaveCount(0)
    await expect(memo.getByRole('slider', { name: 'Voice message position' })).toHaveAttribute('aria-valuetext', /of 0:04$/)
    await expect
      .poll(async () => (await serviceClient().from('voice_plays').select('user_id').eq('message_id', id)).data?.length ?? 0)
      .toBe(1)
  })

  test('the gallery Voice tab lists it, and Show in chat goes there', async ({ alice, browserName }) => {
    const id = await beaVoiceMemo(browserName)
    await alice.openChat()
    await alice.openInfoPanel('Media')
    await alice.page.getByRole('button', { name: 'Voice', exact: true }).filter({ visible: true }).click()
    const row = alice.mediaItems.filter({ hasText: 'Bea · 0:04' })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: 'Show in chat' }).click()
    await expect(memoBubble(alice, id)).toBeInViewport()
  })
})
