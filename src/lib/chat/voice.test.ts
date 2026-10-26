import { beforeEach, describe, expect, it, vi } from 'vitest'

type Step = { prepare: () => Promise<unknown>; onAdded?: (id: string) => void }
const { sendOutgoing, uploadFile, forgetUpload } = vi.hoisted(() => ({
  sendOutgoing: vi.fn(async (_m: unknown, step?: Step) => {
    step?.onAdded?.('id-1')
    return 'id-1' as string | undefined
  }),
  uploadFile: vi.fn(async () => ({ url: 'https://cdn/voice/c1/x.m4a', filename: 'voice-x.m4a', size: 3, type: 'audio/mp4' })),
  forgetUpload: vi.fn(),
}))
vi.mock('@/lib/chat/outbox', () => ({ sendOutgoing, forgetUpload, newId: () => 'uuid' }))
vi.mock('@/lib/bunny', () => ({ uploadFile }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { discardUnsentVoice, sendVoiceMemo } from '@/lib/chat/voice'
import { useMessageStore } from '@/stores/messageStore'
import type { VoiceRecording } from '@/lib/voice/recorder'
import type { Message } from '@/types'

const recording: VoiceRecording = {
  blob: new Blob(['abc'], { type: 'audio/mp4' }),
  format: { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', bitsPerSecond: 128_000 },
  durationMs: 4200,
  peaks: [1, 2, 3],
}
const KEY = 'c1:main'
const inList = (localState?: Message['localState']) =>
  useMessageStore.setState({ messages: { [KEY]: [{ id: 'id-1', space: 'main', localState } as Message] } })
const send = () => sendVoiceMemo({ authorId: 'alice', conversationId: 'c1', space: 'main', recording, replyTo: null })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
  useMessageStore.setState({ messages: {} })
  discardUnsentVoice()
})

describe('sendVoiceMemo', () => {
  it('sends an empty message with one audio attachment, uploaded to voice/<conversation>', async () => {
    await sendVoiceMemo({ authorId: 'alice', conversationId: 'c1', space: 'main', recording, replyTo: 'r1' })
    const [m, step] = sendOutgoing.mock.calls[0]
    expect(m).toEqual({
      authorId: 'alice',
      space: 'main',
      content: null,
      type: 'text',
      replyTo: 'r1',
      attachments: [{ url: 'blob:local', type: 'audio', filename: 'voice-uuid.m4a', size: 3, spoiler: false, duration_ms: 4200, peaks: [1, 2, 3] }],
    })
    const uploaded = await step!.prepare()
    const [file, folder] = uploadFile.mock.calls[0] as unknown as [File, string]
    expect(file.name).toBe('voice-uuid.m4a')
    expect(file.type).toBe('audio/mp4')
    expect(folder).toBe('voice/c1')
    expect(uploaded).toEqual([{ url: 'https://cdn/voice/c1/x.m4a', type: 'audio', filename: 'voice-uuid.m4a', size: 3, spoiler: false, duration_ms: 4200, peaks: [1, 2, 3] }])
  })

  it('frees the local copy once sent', async () => {
    await send()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local')
  })
})

describe('discardUnsentVoice', () => {
  it('removes a failed memo and abandons its upload', async () => {
    inList('failed')
    await send()
    discardUnsentVoice()
    expect(useMessageStore.getState().messages[KEY]).toEqual([])
    expect(forgetUpload).toHaveBeenCalledWith('id-1')
  })

  it('removes a memo that is still uploading', async () => {
    sendOutgoing.mockImplementationOnce(async (_m, step) => {
      step?.onAdded?.('id-1')
      inList('sending')
      discardUnsentVoice() // the disguise comes up mid-upload
      return 'id-1'
    })
    await send()
    expect(useMessageStore.getState().messages[KEY]).toEqual([])
    expect(forgetUpload).toHaveBeenCalledWith('id-1')
  })

  it('leaves a memo that was sent', async () => {
    inList('failed')
    await send()
    inList(undefined) // a Retry went through
    discardUnsentVoice()
    expect(useMessageStore.getState().messages[KEY]).toHaveLength(1)
    expect(forgetUpload).not.toHaveBeenCalled()
  })
})
