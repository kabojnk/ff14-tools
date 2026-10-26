# Voice Memos (Sub-project 5) Implementation Plan

> **Design:** docs/plans/2026-10-23-voice-memos-design.md
> **Mockups (approved 2026-10-23):** https://claude.ai/artifact/98F6wvMviHuxPohmZZFhR7
>
> **For agents:** use team-dev to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. Implementers follow the `tdd` skill (red → green → refactor).
>
> **Gate for every task:** `npx tsc -b && npm run lint && npm test` (0 lint errors).
> - T1 also runs `npm run test:db && npm run test:migration`.
> - T5, T6, T7 and T8 also run `npm run db:reset && npm run e2e` (full suite, both projects), because they change code the website runs. **T1 is merged first**; rebase onto the integration branch before any e2e step (the app subscribes to `voice_plays`, which only exists after T1).
> - Wrap `db:reset`, `test:db`, `test:migration` and `e2e` in the stack lock script from the team briefing, and give each worktree its own `E2E_PORT` (5191 and up).

**Goal:** Discord-style voice memos (hold to record, preview, send, play, a played marker) on the desktop site, the iPhone home-screen app and the iOS app.

**Architecture.**
- **Recording** is the browser's own `MediaRecorder`. That works in Chrome, Safari and the iOS app's WKWebView, so there is no native plugin.
  - `src/lib/voice/recorder.ts` wraps `getUserMedia` + `MediaRecorder` + an `AnalyserNode` (for the live bars and the stored waveform).
  - `src/lib/voice/gesture.ts` is a pure state machine for the hold, slide-to-cancel and slide-to-lock gestures.
  - `useVoiceSession` joins the two to the composer.
- **A memo is an ordinary message** with no text and one `audio` attachment (`duration_ms` and 48 `peaks`). It goes through the existing outbox: it shows at once with the clock tick, and a failure shows Retry. The upload runs before the insert, through `upload-media`.
- **Playback** uses one shared `<audio>` element in `src/stores/voicePlayer.ts`, so only one memo plays at a time. It pauses on the disguise and in the background.
- **Played** is stored in a new `voice_plays` table, written only through `mark_voice_played()`. Reading follows the read-receipts rule, and new plays arrive live on the existing `conv:<id>` channel.

**Tech stack:** no new packages. React 18, Zustand 5, supabase-js, Vitest, Playwright, pgTAP.

**Commit convention:** a short imperative subject, ending with
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Branch:** `feat/voice-memos`, cut from `main` (71cb476). The design doc is commit 2517a42.

**Production safety:**
- No task touches hosted Supabase or pushes.
- There is one additive migration, and a two-line `upload-media` change that the owner deploys on release day (owner checklist, section D).
- The old app keeps working: it shows an audio attachment as a file link.

## Checked while planning (2026-10-26)

| Question | How it was checked | Result |
|---|---|---|
| Which formats each browser records | `MediaRecorder.isTypeSupported` in Playwright's Chromium (Chrome 156) and WebKit (Safari 27) | Both record `audio/mp4;codecs=mp4a.40.2` (AAC `.m4a`), the first choice. Firefox records only WebM/Opus, from its documented support |
| Whether a Chrome recording plays on Safari | Recorded 4 s with Chrome's fake microphone in both formats, served with range requests, then loaded, seeked and played in WebKit and Chromium | Both `.m4a` and `.webm` load, seek to 2.0 s and play in WebKit. WebM reports `duration = Infinity` until played, so the UI uses the stored `duration_ms`, never the element's |
| Browsers that would need the mic hidden | From the above | **None.** The mic is hidden only where recording is impossible: no `MediaRecorder`, no `getUserMedia`, or no supported type |
| `upload-media` | Read `supabase/functions/upload-media/index.ts` | **It refuses audio.** `ALLOWED_TYPES` has no `audio/*`. The function must change (decision 1 below) |
| Bunny file types | Upload is `application/octet-stream`. Bunny's documentation doesn't say how it types files by extension | Videos are already uploaded this way and play inline on both iPhones, so Bunny types by extension. Release day adds a `curl` check that a memo comes back `206` with an audio type |
| Silent switch | WebKit bug reports and the Audio Session API | WKWebView and Safari play media with the ambient session by default, so the silent switch can mute it. `navigator.audioSession.type = 'playback'` (iOS 17+) makes it play. The player sets it while playing; the recorder sets `'play-and-record'`. Both go back to `'auto'` afterwards. Device row V8 confirms it |

## Decisions made while planning (deviations from the design, to report to the user)

| # | Design said | Plan does | Why |
|---|---|---|---|
| 1 | `upload-media` unchanged | It allows `audio/mp4` and `audio/webm`, ignoring any `;codecs=` part. The owner deploys it on release day, before the website | It rejects audio today, so a memo could never upload. The change only adds types, so the old app is unaffected |
| 2 | Hide the mic on a browser whose recordings the iPhones can't play | No browser needs that (see the checks above). The mic is hidden only where recording can't work | Chrome and Safari both record AAC, and WebKit plays Firefox's WebM |
| 3 | A voice bubble is added to `seed.sql` for the theme screenshots | `e2e/themes.spec.ts` inserts it in `beforeAll` (like its code-block message) | The seed's counts are asserted in pgTAP and in several e2e tests. Changing the seed would ripple through all of them |
| 4 | Errors as a "toast" | A short status pill above the composer, gone after 2.5 s | The app has no toast system. The message list's notice belongs to the list. This is the same look |
| 5 | "A light haptic where supported" | `navigator.vibrate(10)` where it exists. Nothing on iPhone | iOS has no web vibration. A native haptics plugin would add a native dependency for one buzz |
| 6 | (not covered) | Lifting the finger when the system interrupts a hold (`pointercancel`, e.g. the first microphone prompt) cancels the recording. The user holds again after allowing | Otherwise a permission prompt would leave a recording running with nothing under the finger |
| 7 | Pending bubble "with a spinner" | The existing clock tick while sending, and the existing failed state with Retry | It matches every other message. Nothing new to learn |
| 8 | Played marker per the RLS rule | RLS **and** the client check the ticks already use (both settings on) | Turning receipts off then hides the marker at once, not after a reload, as with the ticks |
| 9 | The disguise discards a failed, unsent memo | Also the app going to the background on the web (`visibilitychange` hidden), and a memo **still uploading** (its upload is abandoned; a finished upload whose row is being inserted counts as sent) | The design lists background among the disguise triggers. A memo that hasn't uploaded mustn't survive it |
| 10 | (not covered) | `upload-media` accepts audio only into `voice/…` | Otherwise the paperclip could attach `.m4a`/`.webm` as plain files (while `.mp3` is refused) |
| 11 | (not covered) | Esc on a locked desktop recording also counts toward the double-Esc disguise | The double-Esc escape hatch must always work; the cost is that Esc to delete, then Esc again within 0.5 s, hides the app |
| 12 | One shared player | Gallery rows play under their own id (`gallery:<message id>`), still one at a time | Closing the gallery would otherwise stop the same memo playing in the chat |
| 13 | (not covered) | Pinned and search cards say "📎 Voice message (0:42)" | A pinned memo was a blank card |
| 14 | (not covered) | The header's line says "recording a voice message…" too | Otherwise the header said "typing…" while the list said "Recording…" |
| 15 | (not covered) | Turning read receipts back on re-fetches plays, as it re-fetches read positions | Plays from the "off" time were hidden, so the mic stayed grey until a reload |
| 16 | E2E with the `.m4a` fixture | Chromium tests use a WebM/Opus copy of it; WebKit uses the `.m4a` | Playwright's Linux Chromium may have no AAC decoder |

## Task graph

```
T0 (lead) ─┬─ T1 migration + pgTAP ─────────────────────────────────────┐
           ├─ T2 recorder ─────────────────────┐                        │
           ├─ T3 gesture ──────────────────────┤                        │
           ├─ T4 player store ──┬──────────────┤                        │
           └─ T5 realtime: plays + recording ──┼─ T6 bubble + waveform ─┴─ T7 composer ─┐
                                └──────────────┴─ T8 gallery Voice row ─────────────────┴─ T9 e2e, docs, final verification
```

- **Wave 1** (parallel after T0): T1, T2, T3, T4, T5. Merge T1 as soon as it passes: every later e2e gate needs its table.
- **Wave 2:** T6 and T8 (after T4 and T5).
- **Wave 3:** T7, after T2, T3, T4, T5 and T6. It uses T6's `Waveform` for the preview.
- **Last:** T9.

**Ownership** (no file is shared between two parallel tasks):

| Task | Files |
|---|---|
| T1 | `supabase/migrations/20261026090000_voice_memos.sql`, `supabase/tests/database/090_voice_memos.test.sql` |
| T2 | `src/lib/voice/recorder.ts` (+ test) |
| T3 | `src/lib/voice/gesture.ts` (+ test) |
| T4 | `src/stores/voicePlayer.ts` (+ test) |
| T5 | `src/lib/conversationRealtime.ts` (+ test), `src/hooks/useConversationRealtime.ts`, `src/stores/voicePlays.ts` (+ test), `src/stores/typingStore.ts` (+ test), `src/hooks/useTyping.ts` (+ test), `src/components/chat2/TypingBubble.tsx` (+ test), `src/components/chat2/ChatHeader.tsx` (+ test), `src/components/chat2/MessageList.tsx` (the typing line and the receipts effect), `src/stores/messageStore.ts` (+ test), `src/stores/authStore.ts` |
| T6 | `src/components/chat2/Waveform.tsx` (+ test), `src/components/chat2/VoiceBubble.tsx` (+ test), `src/components/chat2/Bubble.tsx` (+ test) |
| T7 | `src/lib/chat/outbox.ts` (+ test), `src/lib/chat/voice.ts` (+ test), `src/components/chat2/useVoiceSession.ts` (+ test), `src/components/chat2/VoiceComposer.tsx` (+ test), `src/components/chat2/Composer.tsx` (+ test) |
| T8 | `src/components/gallery/VoiceRow.tsx` (+ test), `src/components/gallery/MediaGallery.tsx` (+ test), `src/components/chat/ChannelInfoPanel.tsx` (pin and search cards) |
| T9 | `e2e/voice.spec.ts`, `e2e/stubs.ts`, `e2e/themes.spec.ts`, `docs/testing/iphone-checklist.md` (the fixtures `e2e/fixtures/media/voice.m4a` and `voice.webm` are committed with this plan) |

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify (T0) | `Attachment.duration_ms` / `peaks`, `MediaItem.duration_ms`, `VoicePlay`, `TypingActivity` |
| `src/lib/voice/audioSession.ts` (+ test) | Create (T0) | `setAudioSession()`: the Audio Session API, a no-op where missing |
| `src/lib/chat/preview.ts` (+ test) | Modify (T0) | "Voice message (0:42)" |
| `supabase/functions/upload-media/index.ts` | Modify (T0) | Accept `audio/mp4`, `audio/webm` |
| `ios/App/App/Info.plist` | Modify (T0) | Microphone text: "…when you record audio or video." |
| `playwright.config.ts` | Modify (T0) | Chromium's fake microphone |
| `e2e/fixtures/media/voice.m4a`, `voice.webm` | Create (with this plan) | The same 4 s memo recorded in Chrome as AAC and as Opus, for playback tests |
| `docs/release/owner-checklist.md` | Modify (T0) | The migration, the function deploy, a memo check |
| `docs/plans/2026-10-23-voice-memos-design.md` | Modify (T0) | "Changed while planning" |
| `supabase/migrations/20261026090000_voice_memos.sql` | Create (T1) | `voice_plays`, `mark_voice_played`, realtime, `message_media.duration_ms` |
| `supabase/tests/database/090_voice_memos.test.sql` | Create (T1) | pgTAP for all of it |
| `src/lib/voice/recorder.ts` (+ test) | Create (T2) | Format choice, recording, levels and peaks, limit, discard |
| `src/lib/voice/gesture.ts` (+ test) | Create (T3) | Hold / cancel / lock / short tap |
| `src/stores/voicePlayer.ts` (+ test) | Create (T4) | The one audio element; pauses on the disguise and in the background |
| `src/stores/voicePlays.ts` (+ test) | Create (T5) | Who played which memo; `markPlayed()` |
| `src/lib/conversationRealtime.ts` (+ test) | Modify (T5) | `voice_plays` inserts; `activity` on `typing` |
| `src/hooks/useConversationRealtime.ts` | Modify (T5) | Route plays to the store |
| `src/stores/typingStore.ts`, `src/hooks/useTyping.ts` (+ tests) | Modify (T5) | The `recording` activity |
| `src/components/chat2/TypingBubble.tsx` (+ test), `ChatHeader.tsx` (+ test), `MessageList.tsx` | Modify (T5) | "Recording a voice message…" in the list and the header; plays re-fetched when receipts come back on |
| `src/stores/messageStore.ts` (+ test), `src/stores/authStore.ts` | Modify (T5) | Load plays with each page; reset on sign-out |
| `src/components/chat2/Waveform.tsx` (+ test) | Create (T6) | The scrubbable bar waveform (`role="slider"`) |
| `src/components/chat2/VoiceBubble.tsx` (+ test) | Create (T6) | Play/pause, waveform, duration, played marker |
| `src/components/chat2/Bubble.tsx` (+ test) | Modify (T6) | Voice memos render as `VoiceBubble` |
| `src/lib/chat/outbox.ts` (+ test) | Modify (T7) | An upload step before the insert (kept for Retry) |
| `src/lib/chat/voice.ts` (+ test) | Create (T7) | `sendVoiceMemo()`, `discardUnsentVoice()` |
| `src/components/chat2/useVoiceSession.ts` (+ test) | Create (T7) | Composer recording state: phases, gestures, disguise |
| `src/components/chat2/VoiceComposer.tsx` (+ test) | Create (T7) | `MicButton`, `VoicePanel`, `VoiceHint`, `VoiceKeysHint` |
| `src/components/chat2/Composer.tsx` (+ test) | Modify (T7) | The mic in place of Send; the panel in place of the field |
| `src/components/gallery/VoiceRow.tsx` (+ test) | Create (T8) | The gallery's Voice row |
| `src/components/gallery/MediaGallery.tsx` (+ test) | Modify (T8) | Use `VoiceRow` for `audio` |
| `src/components/chat/ChannelInfoPanel.tsx` | Modify (T8) | Pinned and search cards say "Voice message (0:42)" instead of a blank card |
| `e2e/voice.spec.ts`, `e2e/stubs.ts`, `e2e/themes.spec.ts` | Create/Modify (T9) | Voice e2e; a ranged CDN stub; a memo in the screenshots |
| `docs/testing/iphone-checklist.md` | Modify (T9) | Rows V1–V10 |

---

### Task 0 (lead, before the parallel tasks): foundation

**Files:**
- Modify: `src/types/index.ts`, `src/lib/chat/preview.ts`, `src/lib/chat/preview.test.ts`, `supabase/functions/upload-media/index.ts`, `ios/App/App/Info.plist`, `playwright.config.ts`, `docs/release/owner-checklist.md`, `docs/plans/2026-10-23-voice-memos-design.md`
- Create: `src/lib/voice/audioSession.ts`, `src/lib/voice/audioSession.test.ts`

- [ ] **Step 1: Types.** In `src/types/index.ts`:

Replace the `Attachment` interface with:
```ts
export interface Attachment {
  url: string
  type: 'image' | 'video' | 'gif' | 'file' | 'audio'
  filename: string
  size: number
  spoiler: boolean
  /** Voice memos: the length in ms (the player shows this, never the file's own duration). */
  duration_ms?: number
  /** Voice memos: 48 waveform levels, 0–100. */
  peaks?: number[]
}
```
In `MediaItem`, after `spoiler: boolean`, add:
```ts
  /** Voice memos: the length in ms (message_media.duration_ms). */
  duration_ms?: number | null
```
At the end of the file, add:
```ts
/** A voice_plays row: someone started playing a voice memo. */
export interface VoicePlay {
  message_id: string
  user_id: string
  played_at: string
}

/** What a typing broadcast says the person is doing. */
export type TypingActivity = 'typing' | 'recording'
```

- [ ] **Step 2: Write the failing audio session test** `src/lib/voice/audioSession.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { setAudioSession } from '@/lib/voice/audioSession'

type Nav = Navigator & { audioSession?: { type: string } }

afterEach(() => {
  delete (navigator as Nav).audioSession
})

describe('setAudioSession', () => {
  it('sets the Audio Session type where the API exists', () => {
    ;(navigator as Nav).audioSession = { type: 'auto' }
    setAudioSession('playback')
    expect((navigator as Nav).audioSession?.type).toBe('playback')
  })

  it('does nothing where it is missing', () => {
    expect(() => setAudioSession('play-and-record')).not.toThrow()
  })

  it('keeps going when the value is refused', () => {
    ;(navigator as Nav).audioSession = {
      get type() {
        return 'auto'
      },
      set type(_v: string) {
        throw new TypeError('unsupported')
      },
    }
    expect(() => setAudioSession('playback')).not.toThrow()
  })
})
```

- [ ] **Step 3: Run it.** `npx vitest run src/lib/voice/audioSession.test.ts`. Expected: FAIL, "Failed to resolve import".

- [ ] **Step 4: Implement** `src/lib/voice/audioSession.ts`:
```ts
export type AudioSessionType = 'auto' | 'playback' | 'play-and-record'

/**
 * Safari's and WKWebView's Audio Session API (iOS 17+). 'playback' lets a voice memo play with the
 * silent switch on; 'play-and-record' is for recording; 'auto' hands control back. A no-op elsewhere.
 */
export function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // A value this browser doesn't know: keep the one it has.
  }
}
```

- [ ] **Step 5: Run it.** Expected: PASS (3 tests).

- [ ] **Step 6: Preview label test.** Add to `src/lib/chat/preview.test.ts`, inside the existing `describe` for `messagePreview` (use the file's existing message factory, or the literal below):
```ts
  it('labels a voice memo with its length', () => {
    const memo = {
      content: null,
      type: 'text' as const,
      attachments: [{ url: 'u', type: 'audio' as const, filename: 'voice-1.m4a', size: 1, spoiler: false, duration_ms: 42_150 }],
    }
    expect(messagePreview(memo)).toBe('Voice message (0:42)')
    expect(messagePreview({ ...memo, attachments: [{ ...memo.attachments[0], duration_ms: undefined }] })).toBe('Voice message')
  })
```
Run `npx vitest run src/lib/chat/preview.test.ts`. Expected: FAIL (got "Voice message").

- [ ] **Step 7: Implement.** In `src/lib/chat/preview.ts`, add `import { formatDuration } from '@/lib/gallery'`, and replace
```ts
  if (first) return ATTACHMENT_LABEL[first.type] ?? 'Attachment'
```
with
```ts
  if (first) {
    if (first.type === 'audio' && typeof first.duration_ms === 'number') return `Voice message (${formatDuration(first.duration_ms / 1000)})`
    return ATTACHMENT_LABEL[first.type] ?? 'Attachment'
  }
```
Run it again. Expected: PASS.

- [ ] **Step 8: `upload-media`.** In `supabase/functions/upload-media/index.ts`:

Replace the `ALLOWED_TYPES` block with:
```ts
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mp4', 'audio/webm', // voice memos (.m4a, .webm)
  'application/pdf',
  'text/plain',
]
```
Replace
```ts
    if (!ALLOWED_TYPES.includes(file.type)) {
```
with
```ts
    // "audio/webm;codecs=opus" → "audio/webm"
    const baseType = file.type.split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.includes(baseType)) {
```
and, right after that `if` block's closing brace, add:
```ts
    // Audio is for voice memos only (the paperclip still can't attach audio files).
    if (baseType.startsWith('audio/') && !pathPrefix.startsWith('voice/')) {
      return new Response(JSON.stringify({ error: 'File type not allowed' }), { status: 400 })
    }
```
Nothing else changes (Bunny still gets `application/octet-stream`).

- [ ] **Step 9: Info.plist.** In `ios/App/App/Info.plist`, change `<string>XIV uses the microphone when you record a video.</string>` to `<string>XIV uses the microphone when you record audio or video.</string>`.

- [ ] **Step 10: Chromium's fake microphone.** In `playwright.config.ts`, in the `chromium-desktop` project's `use`, add a `launchOptions` line:
```ts
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // A fake microphone (a beep) that needs no permission prompt: voice memo recording tests.
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
      },
```

- [ ] **Step 11: Owner checklist** (`docs/release/owner-checklist.md`):
  - **Line 25:** replace "(sub-project 5, not built yet; you approve its design first)" with "(sub-project 5; design approved 2026-10-23)".
  - **Edge-function secrets "Why" (line 44):** replace with:
    ```
      - *Why:* the secrets don't change. `gif-search` is unchanged; `upload-media` changes once, for voice memos (it accepts audio files), and section D deploys it.
    ```
  - **Section D dry-run list:** replace "plus any voice memo migration, if its design adds one" with `20261026090000_voice_memos`.
  - **After the ⚠️ Push step in section D,** add:
    ```
    - [ ] ⚠️ **Deploy `upload-media`:** `npx --yes supabase@2 functions deploy upload-media`.
      - *Why:* voice memos upload `.m4a` and `.webm` files, which the deployed function refuses. The new version only adds those two types, so the old app keeps working with it. Deploy it before the website, so the first memo from the new app can upload.
    ```
  - **In "Run the quick checks",** add:
    ```
      - Record and send a voice memo from each phone. It plays on the other phone and on the Mac, and the sender's mic turns blue once it's played.
      - Check that the CDN serves memos as audio: in the Supabase dashboard (Table editor → `messages`, newest row), copy the memo's `url` from `attachments`, then run `curl -sI -H 'Range: bytes=0-1' '<url>'`. Expect `HTTP/2 206` and a `content-type` starting with `audio/`. If it says `application/octet-stream`, tell Claude: Safari may refuse to seek.
    ```
  - **Section G, "Harden `upload-media`":** replace "This is the only step in this list that deploys an edge function." with "Apart from the voice memo deploy in section D, this is the only step in this list that deploys an edge function."

- [ ] **Step 12: Design doc.** Append to `docs/plans/2026-10-23-voice-memos-design.md`:
```markdown
## Changed while planning (2026-10-26)

- `upload-media` refuses audio today, so it gains `audio/mp4` and `audio/webm`, deployed on release day (owner checklist, section D).
- Chrome and Safari both record AAC `.m4a`; WebKit plays and seeks Chrome's `.m4a` and `.webm`. No browser needs the mic hidden for playback reasons.
- Silent switch: playback sets `navigator.audioSession.type = 'playback'` (recording sets `'play-and-record'`), back to `'auto'` afterwards.
- The theme screenshots get their voice bubble from `e2e/themes.spec.ts`, not `seed.sql`.
- Errors show as a short pill above the composer; there is no toast system.
- Haptics only where `navigator.vibrate` exists (not iPhone).
- An interrupted hold (`pointercancel`, e.g. the first microphone prompt) cancels.
- The played marker also follows the client-side receipts check, like the ticks.
- On the web, going to the background also discards an unsent memo, failed or still uploading.
- `upload-media` accepts audio only into `voice/…`.
- Esc on a locked desktop recording still counts toward the double-Esc disguise.
- Gallery rows play under their own player id; pinned and search cards say "Voice message (0:42)"; the header says "recording a voice message…".
- Read receipts back on re-fetch plays.
```

- [ ] **Step 13: Gate and commit.**
```bash
npx tsc -b && npm run lint && npm test
git add src/types/index.ts src/lib/voice/audioSession.ts src/lib/voice/audioSession.test.ts src/lib/chat/preview.ts src/lib/chat/preview.test.ts supabase/functions/upload-media/index.ts ios/App/App/Info.plist playwright.config.ts docs/release/owner-checklist.md docs/plans/2026-10-23-voice-memos-design.md
git commit -m "Voice memos groundwork: types, audio session, upload types, checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Migration and pgTAP

**Files:**
- Create: `supabase/migrations/20261026090000_voice_memos.sql`, `supabase/tests/database/090_voice_memos.test.sql`

**Dependencies:** T0

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/database/090_voice_memos.test.sql`:
```sql
-- Voice memos: who played what (read-receipts rule), the membership-checked writer, live updates, gallery length.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Seed: conversation d000…0001 (Alice 1111…, Bea 2222…; Cleo 3333… is not a member), visible session bbbb…0001.
insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, type) values
  ('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', null,
   '[{"url":"http://cdn.test.local/voice/a.m4a","type":"audio","filename":"voice-a.m4a","size":1000,"spoiler":false,"duration_ms":42150,"peaks":[0,50,100]}]', 'text'),
  ('e0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"http://cdn.test.local/voice/b.m4a","type":"audio","filename":"voice-b.m4a","size":1000,"spoiler":false,"duration_ms":1000}]', 'text'),
  ('e0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'just text', '[]', 'text');
update public.profiles set read_receipts = true
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- Shape
select has_table('public', 'voice_plays', 'voice_plays exists');
select policies_are('public', 'voice_plays', array['voice plays per receipts setting'], 'voice_plays has only the select policy');
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_plays'),
  'voice_plays is in the supabase_realtime publication');
select has_column('public', 'message_media', 'duration_ms', 'message_media has duration_ms');
select ok(not has_function_privilege('anon', 'public.mark_voice_played(uuid)', 'execute'), 'anon cannot mark plays');
select is((select duration_ms from public.message_media where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  42150, 'the trigger copies duration_ms from the attachment');

-- As Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select duration_ms from public.get_media('d0000000-0000-4000-8000-000000000001', 'main', array['audio'])
            where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  42150, 'get_media returns duration_ms');
select lives_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$, 'Alice marks Bea''s memo played');
select lives_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$, 'marking again is fine');
select is((select count(*) from public.voice_plays where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  1::bigint, 'marking twice keeps one row');
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000b') $$,
  '22023', null, 'Alice cannot mark her own memo');
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000c') $$,
  '22023', null, 'a message without audio is refused');
select throws_ok($$ insert into public.voice_plays (message_id, user_id)
                    values ('e0000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'no direct writes');
reset role;

-- As Cleo (not a member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'a non-member is refused');
reset role;

-- As Bea: Alice's play, both settings on
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 1::bigint, 'on/on: Bea sees that Alice played her memo');
reset role;

-- Bea turns receipts off: she no longer sees it; Alice still sees her own
update public.profiles set read_receipts = false where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 0::bigint, 'Bea off: she cannot see Alice''s play');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 1::bigint, 'Alice always sees her own play');
reset role;

-- Alice off, Bea on: Bea still can't see it
update public.profiles set read_receipts = true where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set read_receipts = false where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 0::bigint, 'Alice off: Bea cannot see Alice''s play');
reset role;

-- Deleting the message removes its plays
delete from public.messages where id = 'e0000000-0000-4000-8000-00000000000a';
select is((select count(*) from public.voice_plays), 0::bigint, 'deleting a memo deletes its plays');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it.** `npm run test:db` (inside the stack lock; run `npm run db:reset` first). Expected: FAIL in `090_voice_memos.test.sql` (`voice_plays` does not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261026090000_voice_memos.sql`:
```sql
-- Sub-project 5 (expand): voice memos. Who has started playing which memo, written only through
-- mark_voice_played(), and each memo's length in the media index for the gallery's Voice tab.

create table if not exists public.voice_plays (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  played_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.voice_plays enable row level security;
revoke insert, update, delete on public.voice_plays from anon, authenticated;

-- Own plays always; someone else's only when BOTH have read receipts on (the read_positions rule).
drop policy if exists "voice plays per receipts setting" on public.voice_plays;
create policy "voice plays per receipts setting" on public.voice_plays for select to authenticated
  using (
    user_id = auth.uid()
    or (exists (select 1 from public.messages m
                 where m.id = voice_plays.message_id and public.is_member(m.conversation_id))
        and (select p.read_receipts from public.profiles p where p.id = auth.uid())
        and (select p.read_receipts from public.profiles p where p.id = voice_plays.user_id))
  );

-- Starting playback of someone else's memo marks it played (once).
create or replace function public.mark_voice_played(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_author uuid;
  v_deleted boolean;
  v_audio boolean;
begin
  select m.conversation_id, m.author_id, m.deleted,
         exists (select 1
                   from jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
                  where a->>'type' = 'audio')
    into v_conv, v_author, v_deleted, v_audio
    from public.messages m
   where m.id = p_message;
  if v_conv is null then raise exception 'message not found' using errcode = '22023'; end if;
  perform public.require_member(v_conv);
  if v_deleted then raise exception 'message is deleted' using errcode = '22023'; end if;
  if not v_audio then raise exception 'not a voice message' using errcode = '22023'; end if;
  if v_author = auth.uid() then raise exception 'cannot mark your own voice message' using errcode = '22023'; end if;
  insert into public.voice_plays (message_id, user_id) values (p_message, auth.uid())
  on conflict do nothing;
end $$;
revoke execute on function public.mark_voice_played(uuid) from public, anon;
grant execute on function public.mark_voice_played(uuid) to authenticated;

-- Live for both people (RLS decides what each receives).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_plays') then
    alter publication supabase_realtime add table public.voice_plays;
  end if;
end $$;

-- The gallery shows each memo's length.
alter table public.message_media add column if not exists duration_ms integer;

-- Same as 20261020090000, plus duration_ms (only a plain whole number counts; anything else is null).
create or replace function public.rebuild_message_media(m public.messages)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_media where message_id = m.id;
  if m.deleted or m.conversation_id is null or m.space is null then return; end if;

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, extension, size, spoiler, duration_ms, created_at)
  select m.id, m.conversation_id, m.space, m.session_id,
         case when a->>'type' in ('image', 'video', 'gif', 'file', 'audio') then a->>'type' else 'file' end,
         a->>'url', a->>'filename', public.file_extension(a->>'filename'),
         case when a->>'size' ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'size')::numeric::bigint end,
         coalesce(a->'spoiler' = 'true'::jsonb, false),
         case when a->>'duration_ms' ~ '^[0-9]{1,9}$' then (a->>'duration_ms')::integer end,
         m.created_at
    from jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
   where coalesce(a->>'url', '') <> '';

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, created_at)
  select m.id, m.conversation_id, m.space, m.session_id, 'link', u.url,
         lower(substring(u.url from '^[A-Za-z]+://([^/:?#]+)')), m.created_at
    from (select distinct regexp_replace(x[1], '[.,!?;:]+$', '') as url
            from regexp_matches(coalesce(m.content, ''), '(https?://[^\s<>"'')\]]+)', 'gi') as x) u;
end $$;
revoke execute on function public.rebuild_message_media(public.messages) from public, anon, authenticated;

-- Backfill in place (row IDs, the gallery's paging cursors, are kept; a re-run changes nothing).
update public.message_media mm set duration_ms = (a->>'duration_ms')::integer
  from public.messages m, jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
 where mm.message_id = m.id and mm.kind = 'audio' and mm.url = a->>'url'
   and a->>'duration_ms' ~ '^[0-9]{1,9}$' and mm.duration_ms is null;

-- Unchanged body, re-created so the returned row type is re-read with the new column.
create or replace function public.get_media(
  p_conversation uuid,
  p_space text default null,
  p_kinds text[] default null,
  p_extension text default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 60
) returns setof public.message_media
language sql stable security invoker set search_path = '' as $$
  select mm.* from public.message_media mm
   where mm.conversation_id = p_conversation
     and (p_space is null or mm.space = p_space)
     and (p_kinds is null or mm.kind = any (p_kinds))
     and (public.normalize_extension(p_extension) is null or mm.extension = public.normalize_extension(p_extension))
     and (p_before is null
          or mm.created_at < p_before
          or (p_before_id is not null and mm.created_at = p_before and mm.id < p_before_id))
   order by mm.created_at desc, mm.id desc
   limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
revoke execute on function public.get_media(uuid, text, text[], text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_media(uuid, text, text[], text, timestamptz, uuid, integer) to authenticated;
```

- [ ] **Step 4: Run.** `npm run db:reset && npm run test:db && npm run test:migration` (in the lock). Expected: all PASS, 090 with 19 tests. If the `insert` refusal reports a different code than `42501`, print it with `\set` debugging. A "permission denied" and an RLS refusal are both 42501, so a different code means the revoke didn't apply. Fix the migration, not the test.

- [ ] **Step 5: Gate and commit.**
```bash
npx tsc -b && npm run lint && npm test
git add supabase/migrations/20261026090000_voice_memos.sql supabase/tests/database/090_voice_memos.test.sql
git commit -m "Voice memos migration: voice_plays, mark_voice_played, memo lengths in the gallery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Recorder

**Files:**
- Create: `src/lib/voice/recorder.ts`, `src/lib/voice/recorder.test.ts`

**Dependencies:** T0 (`setAudioSession`)

- [ ] **Step 1: Write the failing test** `src/lib/voice/recorder.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECORDING_MS,
  PEAK_COUNT,
  VoiceError,
  pickFormat,
  startRecording,
  toPeaks,
  type RecorderEnv,
} from '@/lib/voice/recorder'

const setAudioSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/voice/audioSession', () => ({ setAudioSession }))

const ALL = new Set(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])

class FakeRecorder {
  static supported = ALL
  static isTypeSupported = (t: string) => FakeRecorder.supported.has(t)
  static last: FakeRecorder | null = null
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string; audioBitsPerSecond: number },
  ) {
    FakeRecorder.last = this
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['abc']) })
    this.onstop?.()
  }
}

let level = 0.25
class FakeAudioContext {
  static last: FakeAudioContext | null = null
  close = vi.fn(async () => {})
  resume = vi.fn(async () => {})
  constructor() {
    FakeAudioContext.last = this
  }
  createAnalyser() {
    return {
      fftSize: 0,
      getFloatTimeDomainData: (buf: Float32Array) => buf.fill(level),
    }
  }
  createMediaStreamSource() {
    return { connect: () => {} }
  }
}

let clock = 0
let track: { stop: ReturnType<typeof vi.fn> }
function env(overrides: Partial<RecorderEnv> = {}): RecorderEnv {
  track = { stop: vi.fn() }
  return {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [track] }) as unknown as MediaStream),
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    now: () => clock,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  clock = 0
  level = 0.25
  FakeRecorder.supported = ALL
})
afterEach(() => vi.useRealTimers())

describe('pickFormat', () => {
  it('prefers AAC in MP4, then MP4, then Opus in WebM, then WebM', () => {
    expect(pickFormat((t) => ALL.has(t))).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', bitsPerSecond: 128_000 })
    expect(pickFormat((t) => t === 'audio/mp4' || t === 'audio/webm')).toEqual({ mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 128_000 })
    expect(pickFormat((t) => t.startsWith('audio/webm'))).toEqual({ mimeType: 'audio/webm;codecs=opus', ext: 'webm', bitsPerSecond: 96_000 })
    expect(pickFormat((t) => t === 'audio/webm')).toEqual({ mimeType: 'audio/webm', ext: 'webm', bitsPerSecond: 96_000 })
    expect(pickFormat(() => false)).toBeNull()
  })
})

describe('toPeaks', () => {
  it('gives 48 bars of 0–100 with the loudest at 100', () => {
    const peaks = toPeaks(Array.from({ length: 500 }, (_, i) => (i % 50) / 100))
    expect(peaks).toHaveLength(PEAK_COUNT)
    expect(Math.max(...peaks)).toBe(100)
    expect(peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 100)).toBe(true)
  })

  it('stretches short recordings and keeps silence at 0', () => {
    expect(toPeaks([0.5, 1])).toHaveLength(PEAK_COUNT)
    expect(toPeaks([])).toEqual(Array(PEAK_COUNT).fill(0))
    expect(toPeaks([0, 0, 0])).toEqual(Array(PEAK_COUNT).fill(0))
  })
})

describe('startRecording', () => {
  it('records with the chosen type and bitrate, and stop() returns the memo', async () => {
    const e = env()
    const rec = await startRecording({}, e)
    expect(FakeRecorder.last?.options).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2', audioBitsPerSecond: 128_000 })
    expect(setAudioSession).toHaveBeenCalledWith('play-and-record')
    vi.advanceTimersByTime(1000)
    clock = 4200
    const memo = await rec.stop()
    expect(memo.blob.type).toBe('audio/mp4')
    expect(memo.format.ext).toBe('m4a')
    expect(memo.durationMs).toBe(4200)
    expect(memo.peaks).toHaveLength(PEAK_COUNT)
    expect(track.stop).toHaveBeenCalled()
    expect(FakeAudioContext.last?.close).toHaveBeenCalled()
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('reports levels while recording', async () => {
    const onLevel = vi.fn()
    await startRecording({ onLevel }, env())
    vi.advanceTimersByTime(200)
    expect(onLevel).toHaveBeenCalled()
    expect(onLevel.mock.calls[0][0]).toBeGreaterThan(0)
    expect(onLevel.mock.calls[0][0]).toBeLessThanOrEqual(1)
  })

  it('discard() releases the microphone, and a later stop() rejects', async () => {
    const rec = await startRecording({}, env())
    rec.discard()
    rec.discard()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(FakeRecorder.last?.state).toBe('inactive')
    await expect(rec.stop()).rejects.toBeInstanceOf(VoiceError)
  })

  it('calls onLimit at 10:00 and caps the length there', async () => {
    const onLimit = vi.fn()
    const rec = await startRecording({ onLimit }, env())
    clock = MAX_RECORDING_MS + 500
    vi.advanceTimersByTime(MAX_RECORDING_MS)
    expect(onLimit).toHaveBeenCalledTimes(1)
    expect(rec.elapsedMs()).toBe(MAX_RECORDING_MS)
    expect((await rec.stop()).durationMs).toBe(MAX_RECORDING_MS)
  })

  it('passes recorder errors on', async () => {
    const onError = vi.fn()
    await startRecording({ onError }, env())
    FakeRecorder.last?.onerror?.()
    expect(onError).toHaveBeenCalled()
  })

  it('maps getUserMedia failures to denied / unavailable / failed and closes the audio context', async () => {
    const fail = (name: string) => env({ getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error(name), { name }))) })
    await expect(startRecording({}, fail('NotAllowedError'))).rejects.toMatchObject({ kind: 'denied' })
    expect(FakeAudioContext.last?.close).toHaveBeenCalled()
    await expect(startRecording({}, fail('NotFoundError'))).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(startRecording({}, fail('AbortError'))).rejects.toMatchObject({ kind: 'failed' })
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('is unavailable when no type is supported', async () => {
    FakeRecorder.supported = new Set()
    await expect(startRecording({}, env())).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('still records (flat waveform) without an AudioContext', async () => {
    const rec = await startRecording({}, env({ AudioContext: undefined }))
    clock = 1000
    expect((await rec.stop()).peaks).toEqual(Array(PEAK_COUNT).fill(0))
  })
})
```

- [ ] **Step 2: Run it.** `npx vitest run src/lib/voice/recorder.test.ts`. Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement** `src/lib/voice/recorder.ts`:
```ts
import { setAudioSession } from '@/lib/voice/audioSession'

/** The longest memo: at 10:00 the composer stops and shows the preview. */
export const MAX_RECORDING_MS = 10 * 60_000
/** From here the timer turns red and counts down. */
export const WARN_AT_MS = MAX_RECORDING_MS - 30_000
/** Waveform bars stored with each memo. */
export const PEAK_COUNT = 48
/** How often the input level is sampled (live bars and peaks). */
const LEVEL_INTERVAL_MS = 50

export interface VoiceFormat {
  mimeType: string
  ext: 'm4a' | 'webm'
  bitsPerSecond: number
}

const FORMATS: VoiceFormat[] = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', bitsPerSecond: 128_000 },
  { mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 128_000 },
  { mimeType: 'audio/webm;codecs=opus', ext: 'webm', bitsPerSecond: 96_000 },
  { mimeType: 'audio/webm', ext: 'webm', bitsPerSecond: 96_000 },
]

/** The first format this browser records: AAC (plays everywhere) before Opus (Firefox). */
export function pickFormat(isTypeSupported: (type: string) => boolean): VoiceFormat | null {
  return FORMATS.find((f) => isTypeSupported(f.mimeType)) ?? null
}

/** Whether this browser can record a memo at all (the mic button shows only then). */
export function canRecordVoice(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  return pickFormat((t) => MediaRecorder.isTypeSupported(t)) !== null
}

/** Levels (0–1, one per sample) down to `n` bars of 0–100: the loudest sample per slice, scaled so the loudest bar is 100. */
export function toPeaks(levels: number[], n = PEAK_COUNT): number[] {
  if (levels.length === 0) return Array(n).fill(0)
  const bars: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * levels.length) / n)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n))
    let max = 0
    for (let j = from; j < to && j < levels.length; j++) max = Math.max(max, levels[j])
    bars.push(max)
  }
  const top = Math.max(...bars)
  return bars.map((v) => (top > 0 ? Math.round((v / top) * 100) : 0))
}

export type VoiceErrorKind = 'denied' | 'unavailable' | 'failed'

export class VoiceError extends Error {
  constructor(readonly kind: VoiceErrorKind) {
    super(`voice recording ${kind}`)
    this.name = 'VoiceError'
  }
}

export interface VoiceRecording {
  /** Typed without codecs ("audio/mp4", "audio/webm"), as upload-media expects. */
  blob: Blob
  format: VoiceFormat
  durationMs: number
  /** PEAK_COUNT values, 0–100. */
  peaks: number[]
}

export interface Recorder {
  /** ms since recording started, at most MAX_RECORDING_MS. */
  elapsedMs(): number
  /** Stops and returns the memo. The microphone is released at once. Calling it again returns the same memo. */
  stop(): Promise<VoiceRecording>
  /** Stops and throws everything away; the microphone is released at once. Safe to call again. */
  discard(): void
}

export interface RecorderOptions {
  /** Each level sample, 0–1 (the live bars). */
  onLevel?: (level: number) => void
  /** MAX_RECORDING_MS reached: the owner calls stop() and shows the preview. */
  onLimit?: () => void
  /** The recorder failed mid-recording: the owner discards. */
  onError?: () => void
}

/** The browser pieces the recorder uses, so tests can pass fakes. */
export interface RecorderEnv {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  MediaRecorder: typeof MediaRecorder
  AudioContext: typeof AudioContext | undefined
  now: () => number
}

function browserEnv(): RecorderEnv {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    MediaRecorder,
    AudioContext: window.AudioContext ?? w.webkitAudioContext,
    now: () => performance.now(),
  }
}

function errorKind(e: unknown): VoiceErrorKind {
  const name = (e as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable'
  return 'failed'
}

/**
 * Asks for the microphone and starts recording. Call it from the press itself: the AudioContext is
 * created before the permission prompt, while the gesture still counts (iOS starts it suspended otherwise).
 * Rejects with a VoiceError.
 */
export async function startRecording(opts: RecorderOptions = {}, env: RecorderEnv = browserEnv()): Promise<Recorder> {
  const format = pickFormat((t) => env.MediaRecorder.isTypeSupported(t))
  if (!format) throw new VoiceError('unavailable')

  let ctx: AudioContext | null = null
  try {
    ctx = env.AudioContext ? new env.AudioContext() : null
    void ctx?.resume().catch(() => {})
  } catch {
    ctx = null
  }
  const closeCtx = () => {
    void ctx?.close().catch(() => {})
    ctx = null
  }

  setAudioSession('play-and-record')
  let stream: MediaStream
  try {
    stream = await env.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (e) {
    closeCtx()
    setAudioSession('auto')
    throw new VoiceError(errorKind(e))
  }

  const levels: number[] = []
  let sampler: ReturnType<typeof setInterval> | null = null
  if (ctx) {
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(1024)
      sampler = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        // RMS of speech sits around 0.05–0.25; ×4 spreads it over the bar heights.
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4)
        levels.push(level)
        opts.onLevel?.(level)
      }, LEVEL_INTERVAL_MS)
    } catch {
      closeCtx()
    }
  }

  const chunks: Blob[] = []
  let mr: MediaRecorder
  try {
    mr = new env.MediaRecorder(stream, { mimeType: format.mimeType, audioBitsPerSecond: format.bitsPerSecond })
  } catch {
    if (sampler) clearInterval(sampler)
    stream.getTracks().forEach((t) => t.stop())
    closeCtx()
    setAudioSession('auto')
    throw new VoiceError('failed')
  }
  mr.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  mr.onerror = () => opts.onError?.()
  mr.start(1000)
  const startedAt = env.now()
  const limit = setTimeout(() => opts.onLimit?.(), MAX_RECORDING_MS)

  let finished = false
  let result: Promise<VoiceRecording> | null = null
  const release = () => {
    if (sampler) clearInterval(sampler)
    sampler = null
    clearTimeout(limit)
    stream.getTracks().forEach((t) => t.stop())
    closeCtx()
    setAudioSession('auto')
  }
  const elapsedMs = () => Math.min(MAX_RECORDING_MS, Math.max(0, env.now() - startedAt))

  return {
    elapsedMs,
    stop() {
      if (result) return result
      if (finished) return Promise.reject(new VoiceError('failed'))
      finished = true
      const durationMs = Math.round(elapsedMs())
      result = new Promise<VoiceRecording>((resolve, reject) => {
        mr.onstop = () => {
          const type = format.mimeType.split(';')[0]
          resolve({ blob: new Blob(chunks, { type }), format, durationMs, peaks: toPeaks(levels) })
        }
        try {
          mr.stop()
        } catch {
          reject(new VoiceError('failed'))
        }
      })
      release()
      return result
    },
    discard() {
      if (finished) return
      finished = true
      mr.onstop = null
      mr.ondataavailable = null
      try {
        if (mr.state !== 'inactive') mr.stop()
      } catch {
        // Already stopped.
      }
      chunks.length = 0
      release()
    },
  }
}
```

- [ ] **Step 4: Run it.** Expected: PASS (11 tests).

- [ ] **Step 5: Gate and commit.**
```bash
npx tsc -b && npm run lint && npm test
git add src/lib/voice/recorder.ts src/lib/voice/recorder.test.ts
git commit -m "Voice recorder: format choice, levels and peaks, 10-minute limit, discard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gesture state machine

**Files:**
- Create: `src/lib/voice/gesture.ts`, `src/lib/voice/gesture.test.ts`

**Dependencies:** T0

- [ ] **Step 1: Write the failing test** `src/lib/voice/gesture.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { CANCEL_PX, IDLE, LOCK_PX, SHORT_TAP_MS, step, type GestureEvent, type GestureState } from '@/lib/voice/gesture'

function run(events: GestureEvent[], from: GestureState = IDLE) {
  let state = from
  const actions: string[] = []
  for (const ev of events) {
    const r = step(state, ev)
    state = r.state
    if (r.action) actions.push(r.action)
  }
  return { state, actions }
}

const down = (t = 0, pointerType = 'touch'): GestureEvent => ({ type: 'down', pointerId: 1, pointerType, x: 300, y: 600, t })
const move = (dx: number, dy: number, pointerId = 1): GestureEvent => ({ type: 'move', pointerId, x: 300 + dx, y: 600 + dy })
const up = (t: number, pointerId = 1): GestureEvent => ({ type: 'up', pointerId, t })

describe('voice gesture', () => {
  it('a touch press starts; a release after 0.5 s sends', () => {
    expect(run([down(0), up(SHORT_TAP_MS)]).actions).toEqual(['start', 'send'])
  })

  it('a release before 0.5 s is a short tap', () => {
    expect(run([down(0), up(SHORT_TAP_MS - 1)]).actions).toEqual(['start', 'short-tap'])
  })

  it('sliding left 120 px cancels; less only tracks the drag', () => {
    const near = run([down(), move(-(CANCEL_PX - 1), 0)])
    expect(near.actions).toEqual(['start'])
    expect(near.state).toMatchObject({ mode: 'holding', dx: -(CANCEL_PX - 1), dy: 0 })
    expect(run([down(), move(-CANCEL_PX, 0)]).actions).toEqual(['start', 'cancel'])
  })

  it('sliding up 80 px locks, and the release then does nothing', () => {
    const r = run([down(0), move(0, -LOCK_PX), up(2000)])
    expect(r.actions).toEqual(['start', 'lock'])
    expect(r.state).toEqual(IDLE)
  })

  it('right and down movement is ignored', () => {
    expect(run([down(), move(200, 200)]).state).toMatchObject({ dx: 0, dy: 0 })
  })

  it('a mouse press starts locked at once', () => {
    expect(run([down(0, 'mouse'), up(10)]).actions).toEqual(['start-locked'])
  })

  it('a system cancel (permission prompt, scroll) cancels', () => {
    expect(run([down(), { type: 'cancel', pointerId: 1 }]).actions).toEqual(['start', 'cancel'])
  })

  it('ignores other pointers and a second press while holding', () => {
    expect(run([down(0), move(-500, 0, 2), up(900, 2), down(10)]).actions).toEqual(['start'])
  })

  it('reset goes back to idle without an action', () => {
    expect(run([down(), { type: 'reset' }])).toEqual({ state: IDLE, actions: ['start'] })
  })
})
```

- [ ] **Step 2: Run it.** `npx vitest run src/lib/voice/gesture.test.ts`. Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement** `src/lib/voice/gesture.ts`:
```ts
/** A press shorter than this records nothing ("Hold to record"). */
export const SHORT_TAP_MS = 500
/** Sliding this far left cancels. */
export const CANCEL_PX = 120
/** Sliding this far up locks (hands-free). */
export const LOCK_PX = 80

export type GestureState =
  | { mode: 'idle' }
  | { mode: 'holding'; pointerId: number; x0: number; y0: number; t0: number; dx: number; dy: number }

export type GestureEvent =
  | { type: 'down'; pointerId: number; pointerType: string; x: number; y: number; t: number }
  | { type: 'move'; pointerId: number; x: number; y: number }
  | { type: 'up'; pointerId: number; t: number }
  | { type: 'cancel'; pointerId: number }
  | { type: 'reset' }

/**
 * - start: a finger went down (record while held).
 * - start-locked: a mouse press (desktop records hands-free at once).
 * - send: released after SHORT_TAP_MS.
 * - short-tap: released sooner.
 * - cancel: slid left, or the system took the pointer.
 * - lock: slid up.
 */
export type GestureAction = 'start' | 'start-locked' | 'send' | 'short-tap' | 'cancel' | 'lock' | null

export const IDLE: GestureState = { mode: 'idle' }

/** The hold-to-record gesture on the mic button. Pure: the composer feeds it pointer events and acts on the result. */
export function step(state: GestureState, ev: GestureEvent): { state: GestureState; action: GestureAction } {
  if (ev.type === 'reset') return { state: IDLE, action: null }
  if (ev.type === 'down') {
    if (state.mode !== 'idle') return { state, action: null }
    if (ev.pointerType === 'mouse') return { state: IDLE, action: 'start-locked' }
    return { state: { mode: 'holding', pointerId: ev.pointerId, x0: ev.x, y0: ev.y, t0: ev.t, dx: 0, dy: 0 }, action: 'start' }
  }
  if (state.mode !== 'holding' || ev.pointerId !== state.pointerId) return { state, action: null }
  if (ev.type === 'move') {
    const dx = Math.min(0, ev.x - state.x0)
    const dy = Math.min(0, ev.y - state.y0)
    if (-dx >= CANCEL_PX) return { state: IDLE, action: 'cancel' }
    if (-dy >= LOCK_PX) return { state: IDLE, action: 'lock' }
    return { state: { ...state, dx, dy }, action: null }
  }
  if (ev.type === 'up') return { state: IDLE, action: ev.t - state.t0 < SHORT_TAP_MS ? 'short-tap' : 'send' }
  return { state: IDLE, action: 'cancel' }
}
```

- [ ] **Step 4: Run it.** Expected: PASS (9 tests).

- [ ] **Step 5: Gate and commit.**
```bash
npx tsc -b && npm run lint && npm test
git add src/lib/voice/gesture.ts src/lib/voice/gesture.test.ts
git commit -m "Voice gesture: hold, slide to cancel, slide to lock, short tap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Player store

**Files:**
- Create: `src/stores/voicePlayer.ts`, `src/stores/voicePlayer.test.ts`

**Dependencies:** T0

- [ ] **Step 1: Write the failing test** `src/stores/voicePlayer.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setAudioSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/voice/audioSession', () => ({ setAudioSession }))

import { setAudioFactoryForTests, useVoicePlayerStore } from '@/stores/voicePlayer'
import { useUiStore } from '@/stores/uiStore'

class FakeAudio extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  readyState = 4
  paused = true
  failNext = false
  play = vi.fn(async () => {
    if (this.failNext) {
      this.failNext = false
      throw new DOMException('nope', 'NotSupportedError')
    }
    this.paused = false
    this.dispatchEvent(new Event('playing'))
  })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  load = vi.fn()
  getAttribute(name: string) {
    return name === 'src' && this.src ? this.src : null
  }
  removeAttribute() {
    this.src = ''
  }
}

let audio: FakeAudio
const store = () => useVoicePlayerStore.getState()

beforeEach(() => {
  audio = new FakeAudio()
  setAudioFactoryForTests(() => audio as unknown as HTMLAudioElement)
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {} })
  useUiStore.setState({ eepMode: false })
})

describe('voicePlayer', () => {
  it('plays a memo, with the playback audio session', async () => {
    expect(await store().toggle('m1', 'https://cdn/a.m4a')).toBe(true)
    expect(audio.src).toBe('https://cdn/a.m4a')
    expect(store()).toMatchObject({ current: 'm1', status: 'playing' })
    expect(setAudioSession).toHaveBeenCalledWith('playback')
  })

  it('toggling the playing memo pauses it', async () => {
    await store().toggle('m1', 'a')
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('paused')
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('one at a time: playing another memo switches the source', async () => {
    await store().toggle('m1', 'a')
    await store().toggle('m2', 'b')
    expect(audio.src).toBe('b')
    expect(store()).toMatchObject({ current: 'm2', status: 'playing', position: 0 })
  })

  it('a failed play is "Can\'t play", and pressing again retries', async () => {
    audio.failNext = true
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('error')
    expect(store().failed.m1).toBe(true)
    expect(await store().toggle('m1', 'a')).toBe(true)
    expect(store().failed.m1).toBeUndefined()
  })

  it('pausing while it loads is a pause, not "Can\'t play"', async () => {
    audio.play.mockImplementationOnce(async () => {
      audio.paused = false
      audio.pause()
      throw new DOMException('interrupted', 'AbortError')
    })
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('paused')
    expect(store().failed.m1).toBeUndefined()
  })

  it('seeking another memo loads it paused at that point', () => {
    store().seek('m3', 'c', 7)
    expect(audio.src).toBe('c')
    expect(audio.currentTime).toBe(7)
    expect(store()).toMatchObject({ current: 'm3', status: 'paused', position: 7 })
  })

  it('seeking waits for metadata when it has none yet', () => {
    audio.readyState = 0
    store().seek('m3', 'c', 5)
    expect(audio.currentTime).toBe(0)
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(5)
  })

  it('stop(id) only stops that memo', async () => {
    await store().toggle('m1', 'a')
    store().stop('m2')
    expect(store().current).toBe('m1')
    store().stop('m1')
    expect(store()).toMatchObject({ current: null, status: null })
    expect(audio.src).toBe('')
  })

  it('the end of a memo goes back to the start', async () => {
    await store().toggle('m1', 'a')
    audio.paused = true
    audio.dispatchEvent(new Event('ended'))
    expect(store()).toMatchObject({ current: 'm1', status: 'paused', position: 0 })
  })

  it('pauses when the disguise comes up', async () => {
    await store().toggle('m1', 'a')
    useUiStore.setState({ eepMode: true })
    expect(audio.pause).toHaveBeenCalled()
    expect(store().status).toBe('paused')
  })

  it('pauses when the page goes to the background', async () => {
    await store().toggle('m1', 'a')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    expect(store().status).toBe('paused')
  })
})
```

- [ ] **Step 2: Run it.** `npx vitest run src/stores/voicePlayer.test.ts`. Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement** `src/stores/voicePlayer.ts`:
```ts
import { create } from 'zustand'
import { onAppStateChange } from '@/lib/appLifecycle'
import { setAudioSession } from '@/lib/voice/audioSession'
import { useUiStore } from '@/stores/uiStore'

export type PlayerStatus = 'loading' | 'playing' | 'paused' | 'error'

interface VoicePlayerState {
  /** The memo in the player: a message id, or the composer's preview id. null: nothing loaded. */
  current: string | null
  status: PlayerStatus | null
  /** Seconds into `current`. */
  position: number
  /** Memos whose last attempt failed ("Can't play"); pressing play again retries. */
  failed: Record<string, true>
  /** Plays `id` (pausing any other), or pauses it if it's playing. Resolves true once playback has started. */
  toggle: (id: string, url: string) => Promise<boolean>
  /** Moves `id` to `seconds`, loading it paused if it isn't the current memo. */
  seek: (id: string, url: string, seconds: number) => void
  pause: () => void
  /** Unloads the player (only if `id` is the current memo, when given): its bubble or preview went away. */
  stop: (id?: string) => void
}

let makeAudio: () => HTMLAudioElement = () => new Audio()
let audio: HTMLAudioElement | null = null
let frame = 0
let guarded = false

/** Tests: the next element comes from `factory`. */
export function setAudioFactoryForTests(factory: () => HTMLAudioElement): void {
  makeAudio = factory
  audio = null
}

/** The disguise, the page going to the background and the iOS app's background pause playback. */
function installGuards() {
  if (guarded) return
  guarded = true
  const pause = () => useVoicePlayerStore.getState().pause()
  useUiStore.subscribe((s, prev) => {
    if (s.eepMode && !prev.eepMode) pause()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause()
  })
  onAppStateChange((active) => {
    if (!active) pause()
  })
}

/**
 * One <audio> element for every voice memo, so only one plays at a time. Bubbles, gallery rows and the
 * composer's preview read `current`, `status` and `position` for their own id.
 */
export const useVoicePlayerStore = create<VoicePlayerState>((set, get) => {
  const stopTicking = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }
  // Smooth progress while playing (timeupdate only fires about 4 times a second).
  const tick = () => {
    if (!audio) return
    set({ position: audio.currentTime })
    frame = requestAnimationFrame(tick)
  }
  const markFailed = (id: string) => set({ status: 'error', failed: { ...get().failed, [id]: true } })
  const clearFailed = (id: string) => {
    if (!get().failed[id]) return get().failed
    const next = { ...get().failed }
    delete next[id]
    return next
  }

  const element = (): HTMLAudioElement => {
    if (audio) return audio
    const a = makeAudio()
    a.preload = 'auto'
    a.addEventListener('playing', () => {
      set({ status: 'playing' })
      stopTicking()
      frame = requestAnimationFrame(tick)
    })
    a.addEventListener('waiting', () => {
      if (get().status === 'playing') set({ status: 'loading' })
    })
    a.addEventListener('pause', () => {
      // A switch to another memo already called play() again: that one's events take over.
      if (!a.paused) return
      stopTicking()
      if (get().status !== 'error') set({ status: 'paused', position: a.currentTime })
      setAudioSession('auto')
    })
    a.addEventListener('ended', () => {
      stopTicking()
      set({ status: 'paused', position: 0 })
      setAudioSession('auto')
    })
    a.addEventListener('error', () => {
      const id = get().current
      // stop() clears the source, which some browsers report as an error: only a loaded memo counts.
      if (!id || !a.getAttribute('src')) return
      stopTicking()
      markFailed(id)
      setAudioSession('auto')
    })
    audio = a
    installGuards()
    return a
  }

  return {
    current: null,
    status: null,
    position: 0,
    failed: {},

    toggle: async (id, url) => {
      const a = element()
      const { current, status } = get()
      if (current === id && (status === 'playing' || status === 'loading')) {
        a.pause()
        return false
      }
      if (current !== id || status === 'error') {
        a.pause()
        a.src = url
        set({ current: id, position: 0 })
      }
      set({ status: 'loading', failed: clearFailed(id) })
      setAudioSession('playback')
      try {
        await a.play()
        return get().current === id
      } catch (e) {
        // A pause (or another memo) before playback began: not a failure. The pause handler set the state.
        if ((e as { name?: string } | null)?.name === 'AbortError') return false
        if (get().current === id) markFailed(id)
        setAudioSession('auto')
        return false
      }
    },

    seek: (id, url, seconds) => {
      const a = element()
      if (get().current !== id) {
        a.pause()
        a.src = url
        set({ current: id, status: 'paused' })
      }
      const to = Math.max(0, seconds)
      set({ position: to })
      if (a.readyState >= 1) a.currentTime = to
      else a.addEventListener('loadedmetadata', () => (a.currentTime = to), { once: true })
    },

    pause: () => audio?.pause(),

    stop: (id) => {
      if (id !== undefined && get().current !== id) return
      stopTicking()
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      set({ current: null, status: null, position: 0 })
      setAudioSession('auto')
    },
  }
})
```

- [ ] **Step 4: Run it.** Expected: PASS (11 tests). If the disguise test fails because `useUiStore.setState` doesn't reach `subscribe` with `prev`, check that Zustand 5's `subscribe(listener)` passes `(state, prevState)`. It does, so the failure is elsewhere.

- [ ] **Step 5: Gate and commit.**
```bash
npx tsc -b && npm run lint && npm test
git add src/stores/voicePlayer.ts src/stores/voicePlayer.test.ts
git commit -m "Voice player: one shared audio element, paused by the disguise and the background

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Realtime: plays and "recording"

**Files:**
- Create: `src/stores/voicePlays.ts`, `src/stores/voicePlays.test.ts`
- Modify: `src/lib/conversationRealtime.ts` (+ `.test.ts`), `src/hooks/useConversationRealtime.ts`, `src/stores/typingStore.ts` (+ `.test.ts`), `src/hooks/useTyping.ts` (+ `.test.ts`), `src/components/chat2/TypingBubble.tsx` (+ `.test.tsx`), `src/components/chat2/ChatHeader.tsx` (+ `.test.tsx`), `src/components/chat2/MessageList.tsx`, `src/stores/messageStore.ts` (+ `.test.ts`), `src/stores/authStore.ts`

**Dependencies:** T0 (and T1 merged before the e2e step)

- [ ] **Step 1: Write the failing store test** `src/stores/voicePlays.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, inFn } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ error: null as unknown })),
  inFn: vi.fn(async () => ({ data: [{ message_id: 'm1', user_id: 'bea' }], error: null as unknown })),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from: () => ({ select: () => ({ in: inFn }) }) },
}))

import { useVoicePlayStore, voiceMessageIds } from '@/stores/voicePlays'
import type { Message } from '@/types'

const s = () => useVoicePlayStore.getState()

beforeEach(() => {
  s().reset()
})

describe('voicePlays', () => {
  it('loads plays for a page of memos', async () => {
    await s().loadFor(['m1', 'm2'])
    expect(inFn).toHaveBeenCalledWith('message_id', ['m1', 'm2'])
    expect(s().byMessage).toEqual({ m1: ['bea'] })
  })

  it('skips the query with no memos', async () => {
    await s().loadFor([])
    expect(inFn).not.toHaveBeenCalled()
  })

  it('applies realtime inserts once', () => {
    s().apply({ message_id: 'm1', user_id: 'bea' })
    s().apply({ message_id: 'm1', user_id: 'bea' })
    expect(s().byMessage.m1).toEqual(['bea'])
  })

  it('marks played at once and calls the RPC', async () => {
    await s().markPlayed('m9', 'alice')
    expect(rpc).toHaveBeenCalledWith('mark_voice_played', { p_message: 'm9' })
    expect(s().byMessage.m9).toEqual(['alice'])
    await s().markPlayed('m9', 'alice')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('undoes the mark when the RPC fails, so the next play tries again', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'boom' } })
    await s().markPlayed('m9', 'alice')
    expect(s().byMessage.m9 ?? []).toEqual([])
  })

  it('picks the voice memos out of a page', () => {
    const m = (id: string, type: 'audio' | 'image' | null) =>
      ({ id, attachments: type ? [{ url: 'u', type, filename: 'f', size: 1, spoiler: false }] : [] }) as unknown as Message
    expect(voiceMessageIds([m('a', 'audio'), m('b', 'image'), m('c', null)])).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run it.** `npx vitest run src/stores/voicePlays.test.ts`. Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement** `src/stores/voicePlays.ts`:
```ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Message, VoicePlay } from '@/types'

type PlayRow = Pick<VoicePlay, 'message_id' | 'user_id'>

interface VoicePlaysState {
  /** message id → who has started playing it. Mine always; theirs only while both have read receipts on (RLS). */
  byMessage: Record<string, string[]>
  /** One `.in('message_id', ids)` query per loaded page. Adds to what it has. Never throws. */
  loadFor: (messageIds: string[]) => Promise<void>
  /** A realtime voice_plays insert. */
  apply: (row: PlayRow) => void
  /** I started playing someone else's memo: shown at once; undone if the server refuses, so the next play retries. */
  markPlayed: (messageId: string, myId: string) => Promise<void>
  reset: () => void
}

const NONE: string[] = []
const inFlight = new Set<string>()

/** The voice memos among `messages`: only they can have plays. */
export function voiceMessageIds(messages: Message[]): string[] {
  return messages.filter((m) => m.attachments?.some((a) => a.type === 'audio')).map((m) => m.id)
}

export const useVoicePlayStore = create<VoicePlaysState>((set, get) => {
  const add = (messageId: string, userId: string) =>
    set((s) => {
      const list = s.byMessage[messageId] ?? NONE
      return list.includes(userId) ? s : { byMessage: { ...s.byMessage, [messageId]: [...list, userId] } }
    })
  const remove = (messageId: string, userId: string) =>
    set((s) => ({ byMessage: { ...s.byMessage, [messageId]: (s.byMessage[messageId] ?? NONE).filter((u) => u !== userId) } }))

  return {
    byMessage: {},

    loadFor: async (messageIds) => {
      if (messageIds.length === 0) return
      try {
        const { data, error } = await supabase.from('voice_plays').select('message_id, user_id').in('message_id', messageIds)
        if (error || !data) return
        for (const row of data as PlayRow[]) add(row.message_id, row.user_id)
      } catch {
        // Offline: the next page load or rejoin fetches them.
      }
    },

    apply: (row) => add(row.message_id, row.user_id),

    markPlayed: async (messageId, myId) => {
      if ((get().byMessage[messageId] ?? NONE).includes(myId) || inFlight.has(messageId)) return
      inFlight.add(messageId)
      add(messageId, myId)
      try {
        const { error } = await supabase.rpc('mark_voice_played', { p_message: messageId })
        if (error) remove(messageId, myId)
      } catch {
        remove(messageId, myId)
      } finally {
        inFlight.delete(messageId)
      }
    },

    reset: () => {
      inFlight.clear()
      set({ byMessage: {} })
    },
  }
})
```
Run it. Expected: PASS (6 tests).

- [ ] **Step 4: Realtime tests first.** In `src/lib/conversationRealtime.test.ts`:
  - Add `onVoicePlay: vi.fn()` to the `handlers()` factory (line 84).
  - In the test "routes broadcasts and database changes…" (around line 254), change the expected typing call to `expect(h.onTyping).toHaveBeenCalledWith('schist', { user_id: 'u2', nickname: 'Bea', activity: 'typing' })`.
  - In the test that checks every non-reaction binding is filtered by conversation (around line 262), change the filter to exclude `voice_plays` as well: `l.filter.table !== 'reactions' && l.filter.table !== 'voice_plays'`.
  - In the test "sends on the joined channel…" (around line 314), the typing payload becomes `{ space: 'main', user_id: 'u1', nickname: 'Alice', activity: 'typing' }`.
  - Add these tests next to the reactions ones:
```ts
  it('binds voice play inserts, unfiltered (RLS scopes them), and routes them', () => {
    const { client, created } = fakeClient()
    const h = handlers()
    createConversationRealtime(client).joinConversation('c1', h)
    const vp = created[0].listeners.filter((l) => l.type === 'postgres_changes' && l.filter.table === 'voice_plays')
    expect(vp.map((l) => l.filter)).toEqual([{ event: 'INSERT', schema: 'public', table: 'voice_plays' }])
    const row = { message_id: 'm1', user_id: 'u2', played_at: '2026-10-26T10:00:00Z' }
    created[0].emitPg('voice_plays', 'INSERT', { new: row, old: {} })
    expect(h.onVoicePlay).toHaveBeenCalledWith(row)
  })

  it('passes the recording activity on, and treats anything else as typing', () => {
    const { client, created } = fakeClient()
    const h = handlers()
    createConversationRealtime(client).joinConversation('c1', h)
    created[0].emitBroadcast('typing', { space: 'main', user_id: 'u2', nickname: 'Bea', activity: 'recording' })
    created[0].emitBroadcast('typing', { space: 'main', user_id: 'u2', nickname: 'Bea', activity: 'juggling' })
    expect(h.onTyping.mock.calls).toEqual([
      ['main', { user_id: 'u2', nickname: 'Bea', activity: 'recording' }],
      ['main', { user_id: 'u2', nickname: 'Bea', activity: 'typing' }],
    ])
  })

  it('sends the activity with typing', () => {
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    rt.joinConversation('c1', handlers())
    rt.sendTyping('main', { user_id: 'u1', nickname: 'Alice' }, 'recording')
    expect(created[0].sent).toEqual([
      { type: 'broadcast', event: 'typing', payload: { space: 'main', user_id: 'u1', nickname: 'Alice', activity: 'recording' } },
    ])
  })
```
(If `fakeClient`'s channel records listeners or emits under different names, use the ones the existing reactions test at line 278 uses: `created[0].listeners`, `emitPg` and `emitBroadcast`.) Run `npx vitest run src/lib/conversationRealtime.test.ts`. Expected: FAIL.

- [ ] **Step 5: Implement the realtime changes** in `src/lib/conversationRealtime.ts`:
  - Imports: `import type { Message, Reaction, ReadPosition, Space, TypingActivity, VoicePlay } from '@/types'`.
  - In `ConversationHandlers`, replace the `onTyping` line and add `onVoicePlay`:
```ts
  /** `activity` is always set by this module; optional so callers and tests may leave it out (it means typing). */
  onTyping(space: Space, user: { user_id: string; nickname: string; activity?: TypingActivity }): void
  /** Someone started playing a voice memo (RLS: only when both have read receipts on, or it's mine). */
  onVoicePlay(row: VoicePlay): void
```
  - Replace the `typing` broadcast handler with:
```ts
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!live()) return
        const { space, user_id, nickname, activity } = payload as { space: Space; user_id: string; nickname: string; activity?: string }
        // Older apps send no activity: that's typing.
        handlers.onTyping(space, { user_id, nickname, activity: activity === 'recording' ? 'recording' : 'typing' })
      })
```
  - After the reactions `DELETE` binding, add:
```ts
      // Unfiltered like reactions: voice_plays has no conversation_id; RLS limits delivery.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_plays' }, (payload) => {
        if (live()) handlers.onVoicePlay(payload.new as VoicePlay)
      })
```
  - Replace the `sendTyping` line in the returned object with:
```ts
    sendTyping: (space: Space, user: { user_id: string; nickname: string }, activity: TypingActivity = 'typing') =>
      send('typing', { space, ...user, activity }),
```
  - Update the doc comment above `createConversationRealtime` from "and on reactions" to "on reactions and voice plays".

  Run the realtime test. Expected: PASS.

- [ ] **Step 6: Typing store test.** Add to `src/stores/typingStore.test.ts`:
```ts
  it('keeps the activity, typing by default', () => {
    const { noteTyping } = useTypingStore.getState()
    noteTyping('main', { user_id: 'bea', nickname: 'Bea', activity: 'recording' }, 1000)
    noteTyping('schist', { user_id: 'bea', nickname: 'Bea' }, 1000)
    expect(useTypingStore.getState().typing.main[0].activity).toBe('recording')
    expect(useTypingStore.getState().typing.schist[0].activity).toBe('typing')
  })
```
(Existing `toEqual` assertions on entries gain `activity: 'typing'`; update them.) Run it. Expected: FAIL.

  **Implement** in `src/stores/typingStore.ts`:
  - `import type { Space, TypingActivity } from '@/types'`
  - `TypingEntry` gains `activity: TypingActivity`.
  - The `noteTyping` signature becomes `noteTyping: (space: Space, user: { user_id: string; nickname: string; activity?: TypingActivity }, at?: number) => void`.
  - Its body pushes `{ user_id: user.user_id, nickname: user.nickname, activity: user.activity ?? 'typing', at }`.

  Run. Expected: PASS.

- [ ] **Step 7: useTyping test.** In `src/hooks/useTyping.test.ts`, existing expectations of `sendTyping(space, user)` gain a third argument `'typing'`. Add:
```ts
  it('announces recording at once, even inside the typing throttle', () => {
    const { result } = renderHook(() => useTyping('main'))
    act(() => result.current.sendTyping())
    act(() => result.current.sendTyping('recording'))
    act(() => result.current.sendTyping('recording'))
    expect(broadcastTyping.mock.calls.map((c) => c[2])).toEqual(['typing', 'recording'])
  })
```
(Use the file's existing mock name for `sendTyping` from `@/lib/conversationRealtime`; it is imported there as the broadcaster.) Run it. Expected: FAIL.

  **Implement** in `src/hooks/useTyping.ts`:
```ts
import type { Space, TypingActivity } from '@/types'
...
  const lastSentRef = useRef<{ space: Space; at: number; activity: TypingActivity }>({ space, at: 0, activity: 'typing' })
...
  const sendTyping = useCallback(
    (activity: TypingActivity = 'typing') => {
      if (!user || !profile) return
      const now = Date.now()
      const last = lastSentRef.current
      if (last.space === space && last.activity === activity && now - last.at < TYPING_THROTTLE) return
      lastSentRef.current = { space, at: now, activity }
      broadcastTyping(space, { user_id: user.id, nickname: profile.nickname }, activity)
    },
    [user, profile, space],
  )
```
  and in `stopTyping`, `lastSentRef.current = { space, at: 0, activity: 'typing' }`. Run. Expected: PASS.

- [ ] **Step 8: TypingBubble test.** Add to `src/components/chat2/TypingBubble.test.tsx`:
```tsx
  it('says when they are recording a voice message', () => {
    render(<TypingBubble names={['Bea']} recording />)
    expect(screen.getByRole('status', { name: 'Bea is recording a voice message' })).toBeInTheDocument()
    expect(screen.getByText('Recording a voice message…')).toBeInTheDocument()
  })
```
Run. Expected: FAIL. **Implement** `src/components/chat2/TypingBubble.tsx`:
```tsx
import { Mic } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'

/** Three bouncing dots in their bubble colour while the partner types in this space; a mic while they record a memo. */
export function TypingBubble({ names, recording = false }: { names: string[]; recording?: boolean }) {
  const plural = names.length !== 1
  if (recording) {
    const label = `${names.join(' and ')} ${plural ? 'are' : 'is'} recording a voice message`
    return (
      <div className="msg-in mt-1 flex">
        <div
          role="status"
          aria-label={label}
          data-typing-bubble="recording"
          className="inline-flex items-center gap-1.5 rounded-[10px] rounded-tl-[2px] bg-[color:var(--them)] px-3 py-2 text-[13px] text-[color:var(--muted)] shadow-[0_1px_0_var(--shadow)]"
        >
          <Icon icon={Mic} size={15} className="text-[color:var(--accent)] motion-safe:animate-pulse" />
          <span aria-hidden="true">Recording a voice message…</span>
        </div>
      </div>
    )
  }
  const label = plural ? `${names.join(' and ')} are typing` : `${names[0]} is typing`
  return (
    <div className="msg-in mt-1 flex">
      <div
        role="status"
        aria-label={label}
        data-typing-bubble
        className="inline-flex gap-[3px] rounded-[10px] rounded-tl-[2px] bg-[color:var(--them)] px-3 py-2.5 shadow-[0_1px_0_var(--shadow)]"
      >
        {[0, 150, 300].map((delay) => (
          <i
            key={delay}
            aria-hidden="true"
            className="typing-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--muted)]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
```
In `src/components/chat2/MessageList.tsx`, replace the `TypingBubble` line (line 492) with:
```tsx
          {typingUsers.length > 0 && (
            <TypingBubble names={typingUsers.map((t) => t.nickname)} recording={typingUsers.some((t) => t.activity === 'recording')} />
          )}
```
Run. Expected: PASS.

- [ ] **Step 9: Wire the store.**
  - **`src/hooks/useConversationRealtime.ts`:** import `useVoicePlayStore` from `@/stores/voicePlays` and add the handler after `onReaction`:
    ```ts
      onVoicePlay(row) {
        useVoicePlayStore.getState().apply(row)
      },
    ```
  - **`src/stores/messageStore.ts`:** add `import { useVoicePlayStore, voiceMessageIds } from '@/stores/voicePlays'`. Then, after each of the two `useReactionStore.getState().loadFor(...)` lines, add the matching line:
    ```ts
      void useVoicePlayStore.getState().loadFor(voiceMessageIds(msgs))
    ```
    In `fetchOlder`, use `page` in place of `msgs`.
  - **`src/stores/authStore.ts`:** after `useReactionStore.getState().reset()` (line 98), add `useVoicePlayStore.getState().reset()` with its import.

  If `messageStore.test.ts` mocks `@/stores/reactionStore` by path, add an equivalent `vi.mock('@/stores/voicePlays', ...)` there returning `{ useVoicePlayStore: { getState: () => ({ loadFor: vi.fn() }) }, voiceMessageIds: () => [] }`.

- [ ] **Step 9a: The header says it too.** Add to `src/components/chat2/ChatHeader.test.tsx` (use the partner id and render helper its existing typing test uses):
```tsx
  it('says "recording a voice message…" while the partner records', () => {
    useTypingStore.setState({
      typing: { main: [{ user_id: PARTNER_ID, nickname: 'Bea', at: Date.now(), activity: 'recording' }], schist: [] },
    })
    renderHeader()
    expect(screen.getByText('recording a voice message…')).toBeInTheDocument()
  })
```
Run it. Expected: FAIL (it says "typing…"). In `src/components/chat2/ChatHeader.tsx`, replace the `typing` selector and the `line`:
```tsx
  const partnerTyping = useTypingStore((s) => (partner.id ? s.typing[activeSpace].find((t) => t.user_id === partner.id) : undefined))
  ...
  const line = partnerTyping
    ? partnerTyping.activity === 'recording'
      ? 'recording a voice message…'
      : 'typing…'
    : presenceLine(partner.presence, lastSeen(partner.profile), new Date())
```
(If `typing` is used anywhere else in the file, use `!!partnerTyping` there.) Run. Expected: PASS.

- [ ] **Step 9b: Receipts back on re-fetch plays**, as they already re-fetch read positions. While either person had receipts off, the partner's plays were hidden, so nothing loaded them. In `src/components/chat2/MessageList.tsx`, add `import { useVoicePlayStore, voiceMessageIds } from '@/stores/voicePlays'`. Then change the receipts effect (around line 110) to:
```tsx
  useEffect(() => {
    // Back on: what they read (and played) meanwhile was hidden, so fetch it.
    if (receiptsOn && !receiptsWereOn.current && myId) {
      void useConversationStore.getState().refreshPartnerReadAt(myId)
      void useVoicePlayStore.getState().loadFor(voiceMessageIds(useMessageStore.getState().messages[key] ?? []))
    }
    receiptsWereOn.current = receiptsOn
  }, [receiptsOn, myId, key])
```
(`useMessageStore` and `key` are already in scope in `MessageList`; add the import if `useMessageStore` isn't imported there.)

- [ ] **Step 10: Gate (with e2e) and commit.**
```bash
npx tsc -b && npm run lint && npm test
# in the stack lock, with this worktree's E2E_PORT:
npm run db:reset && E2E_PORT=<port> npm run e2e
git add src/stores/voicePlays.ts src/stores/voicePlays.test.ts src/lib/conversationRealtime.ts src/lib/conversationRealtime.test.ts src/hooks/useConversationRealtime.ts src/stores/typingStore.ts src/stores/typingStore.test.ts src/hooks/useTyping.ts src/hooks/useTyping.test.ts src/components/chat2/TypingBubble.tsx src/components/chat2/TypingBubble.test.tsx src/components/chat2/ChatHeader.tsx src/components/chat2/ChatHeader.test.tsx src/components/chat2/MessageList.tsx src/stores/messageStore.ts src/stores/messageStore.test.ts src/stores/authStore.ts
git commit -m "Voice plays live on the conversation channel; \"Recording a voice message…\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(The e2e run needs T1's migration for the `voice_plays` binding to report ready. If T1 isn't merged yet, the channel waits up to `POSTGRES_READY_TIMEOUT_MS` for the missing table and the suite slows. Rebase onto the integration branch after T1 lands, before running e2e.)

---

### Task 6: Waveform, voice bubble, Bubble integration

**Files:**
- Create: `src/components/chat2/Waveform.tsx` (+ `.test.tsx`), `src/components/chat2/VoiceBubble.tsx` (+ `.test.tsx`)
- Modify: `src/components/chat2/Bubble.tsx`, `src/components/chat2/Bubble.test.tsx`

**Dependencies:** T1, T4, T5

- [ ] **Step 1: Waveform test** `src/components/chat2/Waveform.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Waveform, resample } from '@/components/chat2/Waveform'

const peaks = Array.from({ length: 48 }, (_, i) => (i * 2) % 100)

describe('resample', () => {
  it('fits any number of peaks into the bar count, and fills missing ones', () => {
    expect(resample(peaks, 40)).toHaveLength(40)
    expect(resample([10, 90], 4)).toEqual([10, 10, 90, 90])
    expect(resample(undefined, 3)).toEqual([30, 30, 30])
  })
})

describe('Waveform', () => {
  it('is a slider with the position as text', () => {
    render(<Waveform peaks={peaks} position={7} duration={19} onSeek={() => {}} label="Voice message position" />)
    const slider = screen.getByRole('slider', { name: 'Voice message position' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '19')
    expect(slider).toHaveAttribute('aria-valuenow', '7')
    expect(slider).toHaveAttribute('aria-valuetext', '0:07 of 0:19')
  })

  it('arrow keys step 5 s, Home and End jump, within bounds', () => {
    const onSeek = vi.fn()
    render(<Waveform peaks={peaks} position={3} duration={19} onSeek={onSeek} label="p" />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek.mock.calls.map((c) => c[0])).toEqual([8, 0, 19, 0])
  })

  it('a tap seeks to that point', () => {
    const onSeek = vi.fn()
    render(<Waveform peaks={peaks} position={0} duration={20} onSeek={onSeek} label="p" />)
    const slider = screen.getByRole('slider')
    slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 28, right: 300, bottom: 28, x: 100, y: 0, toJSON: () => ({}) })
    // jsdom has no PointerEvent: a MouseEvent named pointerdown carries clientX.
    fireEvent(slider, new MouseEvent('pointerdown', { bubbles: true, clientX: 150 }))
    expect(onSeek).toHaveBeenCalledWith(5)
  })

  it('shows a thumb at the position only when asked', () => {
    const { container, rerender } = render(<Waveform peaks={peaks} position={5} duration={20} onSeek={() => {}} label="p" />)
    expect(container.querySelector('[data-thumb]')).toBeNull()
    rerender(<Waveform peaks={peaks} position={5} duration={20} onSeek={() => {}} label="p" thumb />)
    expect(container.querySelector<HTMLElement>('[data-thumb]')?.style.left).toBe('25%')
  })

  it('colours the bars up to the position', () => {
    const { container } = render(<Waveform peaks={peaks} position={10} duration={20} onSeek={() => {}} label="p" bars={10} />)
    expect(container.querySelectorAll('[data-bar="on"]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-bar="off"]')).toHaveLength(5)
  })
})
```
Run `npx vitest run src/components/chat2/Waveform.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Implement** `src/components/chat2/Waveform.tsx`:
```tsx
import { useRef } from 'react'
import { formatDuration } from '@/lib/gallery'

/** Seconds an arrow key moves. */
const KEY_STEP_S = 5

/** `peaks` (0–100) stretched or squeezed to `n` bars; missing peaks draw a flat line at 30. */
export function resample(peaks: number[] | undefined, n: number): number[] {
  if (!peaks || peaks.length === 0) return Array(n).fill(30)
  return Array.from({ length: n }, (_, i) => peaks[Math.min(peaks.length - 1, Math.floor((i * peaks.length) / n))])
}

interface WaveformProps {
  peaks: number[] | undefined
  /** Seconds. */
  position: number
  /** Seconds. */
  duration: number
  /** Called with a time in seconds. */
  onSeek: (seconds: number) => void
  label: string
  bars?: number
  /** A dot at the position (while a memo is playing or part-played). */
  thumb?: boolean
}

/**
 * A memo's waveform as a slider: bars up to the position use --wave-on, the rest --wave-off (set by the
 * parent). Tap or drag to seek; arrow keys step 5 s.
 */
export function Waveform({ peaks, position, duration, onSeek, label, bars = 40, thumb = false }: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const heights = resample(peaks, bars)
  const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0
  const onBars = Math.round(fraction * bars)
  const clamp = (s: number) => Math.min(duration, Math.max(0, s))

  const seekAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    onSeek(clamp(((clientX - rect.left) / rect.width) * duration))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? position + KEY_STEP_S
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? position - KEY_STEP_S
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? duration
              : null
    if (to === null) return
    e.preventDefault()
    onSeek(clamp(to))
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.stopPropagation()
        dragging.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // A pointer that already ended: the tap still seeks.
        }
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.clientX)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onClick={(e) => e.stopPropagation()}
      className="relative flex h-7 min-w-0 flex-1 cursor-pointer touch-pan-y items-center gap-[2px] rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wave-on)]"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          data-bar={i < onBars ? 'on' : 'off'}
          aria-hidden="true"
          className={`block w-[3px] flex-none rounded-[2px] ${i < onBars ? 'bg-[color:var(--wave-on)]' : 'bg-[color:var(--wave-off)]'}`}
          style={{ height: `${Math.round(4 + (h / 100) * 22)}px` }}
        />
      ))}
      {thumb && (
        <span
          data-thumb
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--wave-on)] shadow-[0_0_0_2px_var(--wave-ring,transparent)]"
          style={{ left: `${fraction * 100}%` }}
        />
      )}
    </div>
  )
}
```
Run. Expected: PASS (6 tests).

- [ ] **Step 3: VoiceBubble test** `src/components/chat2/VoiceBubble.test.tsx`:
```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { toggle, markPlayed } = vi.hoisted(() => ({
  toggle: vi.fn(async () => true),
  markPlayed: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { VoiceBubble } from '@/components/chat2/VoiceBubble'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { Attachment, Message, Profile } from '@/types'

const memo: Attachment = { url: 'https://cdn/v.m4a', type: 'audio', filename: 'voice-1.m4a', size: 1, spoiler: false, duration_ms: 19_000, peaks: [10, 50, 90] }
const msg = (author: string, extra: Partial<Message> = {}): Message => ({
  id: 'v1', conversation_id: 'c1', space: 'main', channel_id: null, session_id: 's1', author_id: author,
  content: null, attachments: [memo], type: 'text', edited_at: null, deleted: false, reply_to: null,
  created_at: '2026-10-26T10:00:00Z', ...extra,
})
const profile = (id: string, read_receipts = true) => ({ id, nickname: id, read_receipts }) as unknown as Profile

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useConversationStore.setState({ memberIds: ['alice', 'bea'] })
  useProfileStore.setState({ profiles: { alice: profile('alice'), bea: profile('bea') } })
  useVoicePlayStore.setState({ byMessage: {}, markPlayed })
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {}, toggle, stop: vi.fn() })
})

describe('VoiceBubble', () => {
  it('theirs: the duration and an unplayed dot; playing marks it played', async () => {
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={<span>10:00</span>} />)
    expect(screen.getByText('0:19')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Not played yet' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(toggle).toHaveBeenCalledWith('v1', 'https://cdn/v.m4a')
    expect(markPlayed).toHaveBeenCalledWith('v1', 'alice')
  })

  it('theirs, already played by me: no dot', () => {
    useVoicePlayStore.setState({ byMessage: { v1: ['alice'] } })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.queryByRole('img', { name: 'Not played yet' })).toBeNull()
  })

  it('mine: the mic turns "Played" once they played it, only with both receipts on', () => {
    useVoicePlayStore.setState({ byMessage: { v1: ['bea'] } })
    const { rerender } = render(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    expect(screen.getByRole('img', { name: 'Played' })).toBeInTheDocument()
    act(() => useProfileStore.setState({ profiles: { alice: profile('alice'), bea: profile('bea', false) } }))
    rerender(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    expect(screen.queryByRole('img', { name: 'Played' })).toBeNull()
  })

  it('mine: playing doesn\'t mark anything', async () => {
    render(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(markPlayed).not.toHaveBeenCalled()
  })

  it('while playing: Pause and elapsed / total', () => {
    useVoicePlayerStore.setState({ current: 'v1', status: 'playing', position: 7.2 })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeInTheDocument()
    expect(screen.getByText('0:07 / 0:19')).toBeInTheDocument()
  })

  it("a failed memo says Can't play", () => {
    useVoicePlayerStore.setState({ current: 'v1', status: 'error', failed: { v1: true } })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.getByText("Can't play")).toBeInTheDocument()
  })

  it('stops the player when it goes away', () => {
    const stop = vi.fn()
    useVoicePlayerStore.setState({ stop })
    const { unmount } = render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    unmount()
    expect(stop).toHaveBeenCalledWith('v1')
  })
})
```
Run. Expected: FAIL.

- [ ] **Step 4: Implement** `src/components/chat2/VoiceBubble.tsx`:
```tsx
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { LoaderCircle, Mic, Pause, Play } from 'lucide-react'
import { Waveform } from '@/components/chat2/Waveform'
import { Icon } from '@/components/ui/Icon'
import { formatDuration } from '@/lib/gallery'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { Attachment, Message } from '@/types'

interface VoiceBubbleProps {
  message: Message
  attachment: Attachment
  mine: boolean
  /** The bubble's time and ticks, at the end of the footer line. */
  meta: ReactNode
}

const NONE: string[] = []

/** A voice memo inside its bubble: play/pause, the waveform slider, the length, and the played marker. */
export function VoiceBubble({ message, attachment, mine, meta }: VoiceBubbleProps) {
  const id = message.id
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const partnerId = useConversationStore((s) => s.memberIds.find((m) => m !== myId) ?? null)
  // The ticks' rule: either person turning read receipts off hides "played" at once.
  const receiptsOn = useProfileStore(
    (s) => s.profiles[myId]?.read_receipts !== false && (partnerId ? s.profiles[partnerId]?.read_receipts !== false : true),
  )
  const plays = useVoicePlayStore((s) => s.byMessage[id] ?? NONE)
  const status = useVoicePlayerStore((s) => (s.current === id ? s.status : null))
  const position = useVoicePlayerStore((s) => (s.current === id ? s.position : 0))
  const failed = useVoicePlayerStore((s) => !!s.failed[id])

  useEffect(() => () => useVoicePlayerStore.getState().stop(id), [id])

  const total = (attachment.duration_ms ?? 0) / 1000
  const playing = status === 'playing'
  const active = playing || status === 'loading' || (status === 'paused' && position > 0)
  const unplayed = !mine && !message.localState && !!myId && !plays.includes(myId)
  const played = mine && receiptsOn && plays.some((u) => u !== myId)

  const play = () => {
    void useVoicePlayerStore
      .getState()
      .toggle(id, attachment.url)
      .then((started) => {
        if (started && !mine && !message.localState && myId) void useVoicePlayStore.getState().markPlayed(id, myId)
      })
  }

  const colours = (
    mine
      ? { '--wave-on': 'var(--me-fg)', '--wave-off': 'color-mix(in srgb, var(--me-fg) 35%, transparent)' }
      : { '--wave-on': 'var(--accent)', '--wave-off': 'color-mix(in srgb, var(--muted) 45%, transparent)' }
  ) as CSSProperties

  return (
    <div data-voice-bubble data-voice-state={status ?? 'idle'} className="flex w-[272px] max-w-full flex-col gap-1" style={colours}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            play()
          }}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          className={`grid h-9 w-9 flex-none place-items-center rounded-full ${
            mine ? 'bg-[color:var(--me-fg)] text-[color:var(--me)]' : 'bg-[color:var(--accent)] text-[color:var(--on-accent)]'
          }`}
        >
          {status === 'loading' ? (
            <Icon icon={LoaderCircle} size={16} className="motion-safe:animate-spin" />
          ) : (
            <Icon icon={playing ? Pause : Play} size={16} fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <Waveform
          peaks={attachment.peaks}
          position={position}
          duration={total}
          onSeek={(s) => useVoicePlayerStore.getState().seek(id, attachment.url, s)}
          label="Voice message position"
          thumb={active}
        />
      </div>
      <div className={`flex items-center gap-1.5 pl-[46px] text-[12px] ${mine ? 'text-[color:var(--me-muted)]' : 'text-[color:var(--muted)]'}`}>
        {mine && (
          <Icon
            icon={Mic}
            size={13}
            strokeWidth={2.4}
            {...(played ? { role: 'img', 'aria-label': 'Played' } : {})}
            className={played ? 'text-[color:var(--tick)]' : ''}
          />
        )}
        <span className="tabular-nums">{failed ? "Can't play" : active ? `${formatDuration(position)} / ${formatDuration(total)}` : formatDuration(total)}</span>
        {unplayed && <span role="img" aria-label="Not played yet" className="h-[7px] w-[7px] rounded-full bg-[color:var(--accent)]" />}
        <span className="flex-1" />
        {meta}
      </div>
    </div>
  )
}
```
Run. Expected: PASS (7 tests). If lucide in this repo has no `LoaderCircle`, use `Loader2` (the same icon under its older name).

- [ ] **Step 5: Bubble test.** Add to `src/components/chat2/Bubble.test.tsx` (using its message factory, or the literal):
```tsx
  it('renders a voice memo as a voice bubble, with the time inside it', () => {
    const voice = {
      ...msg({ content: null }),
      attachments: [{ url: 'https://cdn/v.m4a', type: 'audio' as const, filename: 'voice-1.m4a', size: 1, spoiler: false, duration_ms: 4000, peaks: [] }],
    }
    const { container } = render(<Bubble message={voice} mine={false} tail />)
    const bubble = container.querySelector('[data-voice-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble?.querySelector('[data-meta] time')).not.toBeNull()
    expect(container.querySelector('[data-media]')).toBeNull()
  })
```
Run. Expected: FAIL.

- [ ] **Step 6: Implement** in `src/components/chat2/Bubble.tsx`:
  - Import `VoiceBubble` from `@/components/chat2/VoiceBubble`.
  - Split `meta` into its items and two wrappers:
```tsx
  const voice = !hasText && attachments.length === 1 && attachments[0].type === 'audio' ? attachments[0] : null
  const metaTone = mine ? 'text-[color:var(--me-muted)]' : 'text-[color:var(--muted)]'
  const metaItems = (
    <>
      {message.edited_at && <span>edited</span>}
      {pinned && <Icon icon={Pin} size={10} role="img" aria-label="Pinned" />}
      <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
        {formatTime(message.created_at)}
      </time>
      {mine && tick && <Ticks state={tick} onRetry={onRetry} />}
    </>
  )
  const meta = (
    <span data-meta className={`float-right ml-2.5 mt-1.5 inline-flex items-center gap-1 text-[10.5px] leading-4 ${metaTone}`}>
      {metaItems}
    </span>
  )
```
  - In the returned bubble, replace the attachments block and the text/meta block with:
```tsx
      {header}
      {voice ? (
        <VoiceBubble
          message={message}
          attachment={voice}
          mine={mine}
          meta={
            <span data-meta className={`inline-flex items-center gap-1 text-[10.5px] leading-4 ${metaTone}`}>
              {metaItems}
            </span>
          }
        />
      ) : (
        <>
          {attachments.length > 0 && (
            <div className={hasText ? 'mb-1' : ''}>
              <MediaBlock
                // Keyed by the spoiler flags: an item re-marked as a spoiler blurs again, even if revealed.
                key={`${message.id}:${attachments.map((a) => (a.spoiler ? 1 : 0)).join('')}`}
                messageId={message.id}
                attachments={attachments}
                overlay={mediaOnly ? meta : undefined}
              />
            </div>
          )}
          {hasText ? (
            <>
              <Markdown content={content} emoji={emoji} onHighlight={onHighlight} className="inline" />
              {meta}
            </>
          ) : (
            !mediaOnly && meta
          )}
        </>
      )}
```
  Run all Bubble tests. Expected: PASS (existing ones unchanged).

- [ ] **Step 7: Gate (with e2e) and commit.**
```bash
npx tsc -b && npm run lint && npm test
npm run db:reset && E2E_PORT=<port> npm run e2e   # in the stack lock
git add src/components/chat2/Waveform.tsx src/components/chat2/Waveform.test.tsx src/components/chat2/VoiceBubble.tsx src/components/chat2/VoiceBubble.test.tsx src/components/chat2/Bubble.tsx src/components/chat2/Bubble.test.tsx
git commit -m "Voice bubble: play/pause, waveform slider, played marker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Composer: recording, preview, sending

**Files:**
- Create: `src/lib/chat/voice.ts` (+ `.test.ts`), `src/components/chat2/useVoiceSession.ts` (+ `.test.ts`), `src/components/chat2/VoiceComposer.tsx` (+ `.test.tsx`)
- Modify: `src/lib/chat/outbox.ts` (+ `.test.ts`), `src/components/chat2/Composer.tsx` (+ `.test.tsx`)

**Dependencies:** T1, T2, T3, T4, T5, T6

- [ ] **Step 1: Outbox test.** Add to `src/lib/chat/outbox.test.ts`. It reuses the file's existing mock `sendMessage`, which `beforeEach` resets so that it resolves `undefined` (a failed insert), and conversation `conv-1`:
```ts
  const VOICE = { url: 'https://cdn/voice/x.m4a', type: 'audio' as const, filename: 'voice-x.m4a', size: 10, spoiler: false }
  const voiceMessage = { authorId: 'alice', space: 'main' as const, content: null, attachments: [{ ...VOICE, url: 'blob:local' }], type: 'text' as const, replyTo: null }
  const key = spaceKey('conv-1', 'main')

  it('runs the upload step before the insert, tells the caller the id first, and a retry reuses a finished upload', async () => {
    const prepare = vi.fn(async () => [VOICE])
    const onAdded = vi.fn()
    sendMessage.mockResolvedValueOnce(null) // the insert fails once
    const id = await sendOutgoing(voiceMessage, { prepare, onAdded })
    expect(onAdded).toHaveBeenCalledWith(id)
    expect(sendMessage.mock.calls[0][0].attachments).toEqual([VOICE])
    await retryOutgoing(key, id!)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[1][0].attachments).toEqual([VOICE])
  })

  it('a failed upload fails the message without inserting, and Retry uploads again', async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([VOICE])
    const id = await sendOutgoing(voiceMessage, { prepare })
    expect(useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState).toBe('failed')
    expect(sendMessage).not.toHaveBeenCalled()
    await retryOutgoing(key, id!)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('an upload forgotten while in flight (the disguise) sends nothing and fails nothing', async () => {
    let finish: (a: typeof VOICE[]) => void = () => {}
    const prepare = vi.fn(() => new Promise<typeof VOICE[]>((r) => (finish = r)))
    let added = ''
    const sending = sendOutgoing(voiceMessage, { prepare, onAdded: (id) => (added = id) })
    await Promise.resolve()
    forgetUpload(added)
    useMessageStore.getState().removeMessage(key, added)
    finish([VOICE])
    await sending
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useMessageStore.getState().messages[key]?.some((m) => m.id === added) ?? false).toBe(false)
  })

  it('never inserts a local blob: copy without its upload step', async () => {
    const id = await sendOutgoing(voiceMessage, { prepare: async () => Promise.reject(new Error('offline')) })
    forgetUpload(id!)
    await retryOutgoing(key, id!)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState).toBe('failed')
  })
```
(Import `forgetUpload` from `@/lib/chat/outbox` and `spaceKey` from `@/lib/spaces` if the file doesn't already.) Run `npx vitest run src/lib/chat/outbox.test.ts`. Expected: FAIL (`sendOutgoing` takes one argument; `forgetUpload` doesn't exist).

- [ ] **Step 2: Implement** in `src/lib/chat/outbox.ts`:
  - Change the type import to `import type { Attachment, Message } from '@/types'`.
  - Add this above `sendOutgoing`:
```ts
/** A message whose attachments upload before the row is inserted (voice memos). */
export interface UploadStep {
  /** Uploads and returns the attachments to send in place of the local ones. */
  prepare: () => Promise<Attachment[]>
  /** The message is in the list (as "sending") under this id: before the upload starts. */
  onAdded?: (id: string) => void
}

/**
 * Upload steps by message id, kept for Retry until the row is inserted. The step is memoised once it
 * succeeds, so a retry after a failed insert doesn't upload again.
 */
const uploads = new Map<string, () => Promise<Attachment[]>>()

function memoise(fn: () => Promise<Attachment[]>): () => Promise<Attachment[]> {
  let done: Promise<Attachment[]> | null = null
  return () => {
    done ??= fn().catch((e: unknown) => {
      done = null
      throw e
    })
    return done
  }
}

/** Abandons a message's upload step: an upload still running is then sent nowhere. */
export function forgetUpload(id: string): void {
  uploads.delete(id)
}
```
  - Change `sendOutgoing` to take the step and return the id:
```ts
export async function sendOutgoing(m: Omit<OutgoingMessage, 'id'>, upload?: UploadStep): Promise<string | undefined> {
  const conv = useConversationStore.getState()
  const conversationId = conv.conversation?.id
  if (!conversationId) return undefined
  const id = newId()
  ...(unchanged up to and including addPending)
  if (upload) {
    uploads.set(id, memoise(upload.prepare))
    upload.onAdded?.(id)
  }
  await deliver(key, { ...m, id })
  return id
}
```
  - At the top of `deliver`, before `const conv = …`:
```ts
  const prepare = uploads.get(m.id)
  if (prepare) {
    let attachments: Attachment[]
    try {
      attachments = await prepare()
    } catch {
      // Forgotten meanwhile (the disguise): it's gone from the list already, so nothing to fail.
      if (uploads.get(m.id) === prepare) useMessageStore.getState().failPending(key, m.id)
      return
    }
    // Forgotten while uploading: send nothing.
    if (uploads.get(m.id) !== prepare) return
    m = { ...m, attachments }
  } else if (m.attachments.some((a) => a.url.startsWith('blob:'))) {
    // A local copy without its upload step can never be sent.
    useMessageStore.getState().failPending(key, m.id)
    return
  }
```
  - After `store.confirmPending(key, m.id, data)`, add `uploads.delete(m.id)`.

  Run. Expected: PASS (all outbox tests, old and new).

- [ ] **Step 3: `voice.ts` test** `src/lib/chat/voice.test.ts`:
```ts
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
```
Run. Expected: FAIL.

- [ ] **Step 4: Implement** `src/lib/chat/voice.ts`:
```ts
import { uploadFile } from '@/lib/bunny'
import { forgetUpload, newId, sendOutgoing } from '@/lib/chat/outbox'
import { spaceKey } from '@/lib/spaces'
import type { VoiceRecording } from '@/lib/voice/recorder'
import { useMessageStore } from '@/stores/messageStore'
import type { Attachment, Space } from '@/types'

/** My memos from the moment they're in the list until they're sent: the disguise throws these away. */
const unsent = new Map<string, { key: string; local: string }>()

interface SendVoice {
  authorId: string
  conversationId: string
  space: Space
  recording: VoiceRecording
  replyTo: string | null
}

/**
 * Sends a memo: it shows at once (playable from the local copy) while it uploads to voice/<conversation>,
 * then the row is inserted. A failed upload or insert leaves it in the list with Retry.
 */
export async function sendVoiceMemo({ authorId, conversationId, space, recording, replyTo }: SendVoice): Promise<void> {
  const key = spaceKey(conversationId, space)
  const filename = `voice-${newId()}.${recording.format.ext}`
  const file = new File([recording.blob], filename, { type: recording.blob.type })
  const local = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(recording.blob) : ''
  const base = { type: 'audio' as const, filename, spoiler: false, duration_ms: recording.durationMs, peaks: recording.peaks }
  const attachment: Attachment = { url: local, size: file.size, ...base }

  const id = await sendOutgoing(
    { authorId, space, content: null, attachments: [attachment], type: 'text', replyTo },
    {
      prepare: async () => {
        const result = await uploadFile(file, `voice/${conversationId}`)
        return [{ url: result.url, size: result.size, ...base }]
      },
      onAdded: (added) => unsent.set(added, { key, local }),
    },
  )
  if (!id || !unsent.has(id)) return // never added, or already thrown away
  // A failed memo keeps its local copy for Retry (and stays discardable); a sent one doesn't need it.
  if (useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState === 'failed') return
  unsent.delete(id)
  if (local) URL.revokeObjectURL(local)
}

/**
 * The disguise: my memos that are still uploading or failed leave the list, their uploads are abandoned
 * (an upload that finishes later sends nothing), and the recordings are freed. A memo whose upload has
 * finished and whose row is being inserted has, in effect, been sent: it may come back with the echo.
 */
export function discardUnsentVoice(): void {
  const store = useMessageStore.getState()
  for (const [id, { key, local }] of unsent) {
    const m = store.messages[key]?.find((x) => x.id === id)
    if (m?.localState) {
      forgetUpload(id)
      store.removeMessage(key, id)
    }
    if (local) URL.revokeObjectURL(local)
  }
  unsent.clear()
}
```
Run. Expected: PASS (5 tests).

- [ ] **Step 5: useVoiceSession test** `src/components/chat2/useVoiceSession.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { startRecording, sendVoiceMemo, discardUnsentVoice, recorder, stopPlayer } = vi.hoisted(() => {
  const recorder = {
    elapsedMs: vi.fn(() => 1000),
    stop: vi.fn(async () => ({ blob: new Blob(['a'], { type: 'audio/mp4' }), format: { mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 1 }, durationMs: 1000, peaks: [] })),
    discard: vi.fn(),
  }
  return {
    recorder,
    startRecording: vi.fn(async (_o?: { onLimit?: () => void }) => recorder),
    sendVoiceMemo: vi.fn(async () => {}),
    discardUnsentVoice: vi.fn(),
    stopPlayer: vi.fn(),
  }
})
vi.mock('@/lib/voice/recorder', async (orig) => ({ ...(await orig<typeof import('@/lib/voice/recorder')>()), startRecording }))
vi.mock('@/lib/chat/voice', () => ({ sendVoiceMemo, discardUnsentVoice }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useVoiceSession } from '@/components/chat2/useVoiceSession'
import { VoiceError } from '@/lib/voice/recorder'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'

const sendTyping = vi.fn()
const stopTyping = vi.fn()
const onSent = vi.fn()

function setup() {
  return renderHook(() =>
    useVoiceSession({ conversationId: 'c1', space: 'main', replyTo: null, onSent, sendTyping, stopTyping }),
  )
}
type Session = ReturnType<typeof setup>['result']

const target = { setPointerCapture: () => {} }
const pe = (type: string, pointerType: string, x = 300, y = 600) =>
  ({ pointerId: 1, pointerType, button: 0, clientX: x, clientY: y, currentTarget: target, preventDefault: () => {}, type }) as never

async function press(r: Session, pointerType = 'touch') {
  await act(async () => r.current.press.onPointerDown(pe('pointerdown', pointerType)))
}
async function release(r: Session, afterMs: number) {
  act(() => vi.advanceTimersByTime(afterMs))
  await act(async () => r.current.press.onPointerUp(pe('pointerup', 'touch')))
}

beforeEach(() => {
  vi.useFakeTimers()
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useUiStore.setState({ eepMode: false, pinLocked: false })
  useVoicePlayerStore.setState({ stop: stopPlayer })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('useVoiceSession', () => {
  it('hold then release after 0.5 s sends, and says "recording" meanwhile', async () => {
    const { result } = setup()
    await press(result)
    expect(result.current.phase).toBe('holding')
    expect(sendTyping).toHaveBeenCalledWith('recording')
    await release(result, 1200)
    expect(result.current.phase).toBe('idle')
    expect(recorder.stop).toHaveBeenCalled()
    expect(sendVoiceMemo).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'alice', conversationId: 'c1', space: 'main', replyTo: null }))
    expect(onSent).toHaveBeenCalled()
    expect(stopTyping).toHaveBeenCalled()
  })

  it('a short tap records nothing and hints', async () => {
    const { result } = setup()
    await press(result)
    await release(result, 200)
    expect(recorder.discard).toHaveBeenCalled()
    expect(sendVoiceMemo).not.toHaveBeenCalled()
    expect(result.current.hint).toBe('Hold to record')
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.hint).toBeNull()
  })

  it('sliding left cancels', async () => {
    const { result } = setup()
    await press(result)
    await act(async () => result.current.press.onPointerMove(pe('pointermove', 'touch', 160, 600)))
    expect(result.current.phase).toBe('idle')
    expect(recorder.discard).toHaveBeenCalled()
  })

  it('sliding up locks; the release does nothing; Send sends', async () => {
    const { result } = setup()
    await press(result)
    await act(async () => result.current.press.onPointerMove(pe('pointermove', 'touch', 300, 500)))
    expect(result.current.phase).toBe('locked')
    await release(result, 2000)
    expect(result.current.phase).toBe('locked')
    await act(async () => result.current.send())
    expect(sendVoiceMemo).toHaveBeenCalledTimes(1)
  })

  it('a mouse press records locked; the click that follows is not a Send', async () => {
    const { result } = setup()
    await press(result, 'mouse')
    expect(result.current.phase).toBe('locked')
    await act(async () => result.current.press.onClick({ detail: 1 } as never))
    expect(sendVoiceMemo).not.toHaveBeenCalled()
  })

  it('keyboard activation records locked', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    expect(result.current.phase).toBe('locked')
  })

  it('Stop shows the preview; Send sends it; Delete drops it', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    await act(async () => result.current.stopToPreview())
    expect(result.current.phase).toBe('preview')
    expect(result.current.preview?.url).toBe('blob:preview')
    await act(async () => result.current.send())
    expect(sendVoiceMemo).toHaveBeenCalledTimes(1)
    expect(stopPlayer).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(result.current.phase).toBe('idle')
  })

  it('10:00 goes to the preview even while holding', async () => {
    const { result } = setup()
    await press(result)
    const opts = startRecording.mock.calls[0][0]!
    await act(async () => opts.onLimit?.())
    expect(result.current.phase).toBe('preview')
    await release(result, 100)
    expect(result.current.phase).toBe('preview')
  })

  it('the disguise discards a recording and unsent memos', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    act(() => useUiStore.setState({ eepMode: true }))
    expect(result.current.phase).toBe('idle')
    expect(recorder.discard).toHaveBeenCalled()
    expect(discardUnsentVoice).toHaveBeenCalled()
  })

  it('the page going to the background discards', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    expect(result.current.phase).toBe('idle')
  })

  it('a refused microphone goes back to idle with a hint', async () => {
    startRecording.mockRejectedValueOnce(new VoiceError('denied'))
    const { result } = setup()
    await press(result)
    expect(result.current.phase).toBe('idle')
    expect(result.current.hint).toMatch(/^Microphone access is off/)
  })

  it('stops announcing "recording" once the memo is sent', async () => {
    const { result } = setup()
    await press(result)
    await release(result, 1200)
    sendTyping.mockClear()
    act(() => vi.advanceTimersByTime(1000))
    expect(sendTyping).not.toHaveBeenCalled()
  })

  it('Stop and the limit at once make one preview', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    const opts = startRecording.mock.calls[0][0]!
    await act(async () => {
      result.current.stopToPreview()
      opts.onLimit?.()
    })
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(result.current.phase).toBe('preview')
  })

  it('unmounting discards', async () => {
    const { result, unmount } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    unmount()
    await act(async () => {})
    expect(recorder.discard).toHaveBeenCalled()
  })
})
```
Run `npx vitest run src/components/chat2/useVoiceSession.test.ts`. Expected: FAIL.

- [ ] **Step 6: Implement** `src/components/chat2/useVoiceSession.ts`:
```ts
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { onAppStateChange } from '@/lib/appLifecycle'
import { discardUnsentVoice, sendVoiceMemo } from '@/lib/chat/voice'
import { isNativeApp } from '@/lib/platform'
import { IDLE, SHORT_TAP_MS, step, type GestureAction, type GestureEvent } from '@/lib/voice/gesture'
import { VoiceError, startRecording, type Recorder, type VoiceRecording } from '@/lib/voice/recorder'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import type { Message, Space, TypingActivity } from '@/types'

export type VoicePhase = 'idle' | 'holding' | 'locked' | 'preview'
/** The player id of the composer's preview. */
export const PREVIEW_ID = 'voice-preview'
/** Live level samples kept for the recording row's bars. */
const LIVE_LEVELS = 64
const TICK_MS = 200
const HINT_MS = 2500

export interface VoiceSession {
  phase: VoicePhase
  elapsedMs: number
  /** Recent input levels (0–1), oldest first. */
  levels: number[]
  /** While holding: how far the finger has slid left (dx) and up (dy), both ≤ 0. */
  drag: { dx: number; dy: number }
  preview: { recording: VoiceRecording; url: string } | null
  /** A short message over the composer ("Hold to record", microphone problems). */
  hint: string | null
  /** For the mic / Send button. */
  press: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
    onClick: (e: ReactMouseEvent<HTMLElement>) => void
  }
  stopToPreview: () => void
  send: () => void
  discard: () => void
}

interface Options {
  conversationId: string
  space: Space
  replyTo: Message | null
  /** A memo went out (the composer clears the reply). */
  onSent: () => void
  sendTyping: (activity?: TypingActivity) => void
  stopTyping: () => void
}

function errorHint(e: unknown): string {
  const kind = e instanceof VoiceError ? e.kind : 'failed'
  if (kind === 'denied') {
    return isNativeApp()
      ? 'Microphone access is off. Turn it on in Settings → XIV.'
      : "Microphone access is off. Allow it in the browser's settings for this site."
  }
  if (kind === 'unavailable') return 'No microphone found.'
  return "Couldn't start recording."
}

const vibrate = () => {
  if ('vibrate' in navigator) navigator.vibrate(10)
}

/**
 * The composer's voice memo: hold to record (release sends, slide left cancels, slide up locks),
 * a mouse or keyboard press records locked, Stop shows the preview, and the 10-minute limit does too.
 * The disguise, the PIN lock, the background, a space change and unmounting all discard, releasing the
 * microphone at once.
 */
export function useVoiceSession(options: Options): VoiceSession {
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const [elapsedMs, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const [preview, setPreviewState] = useState<VoiceSession['preview']>(null)
  const [hint, setHint] = useState<string | null>(null)

  const opts = useRef(options)
  opts.current = options
  const phaseRef = useRef<VoicePhase>('idle')
  const previewRef = useRef<VoiceSession['preview']>(null)
  const gestureRef = useRef(IDLE)
  /** Bumped by every reset: a recorder that starts after its session was discarded is thrown away. */
  const genRef = useRef(0)
  const startRef = useRef<Promise<Recorder | null> | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  /** A stop is under way: a new press waits until it has finished. */
  const stoppingRef = useRef(false)
  /** The phase a press began in: the click at the end of a hold-then-lock is not a Send. */
  const pressPhaseRef = useRef<VoicePhase>('idle')

  const setPhase = (p: VoicePhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }
  const setPreview = (p: VoiceSession['preview']) => {
    previewRef.current = p
    setPreviewState(p)
  }

  /** Back to idle, keeping nothing. Safe to call at any time. */
  const reset = () => {
    genRef.current++
    gestureRef.current = IDLE
    recorderRef.current?.discard()
    recorderRef.current = null
    void startRef.current?.then((r) => r?.discard())
    startRef.current = null
    const p = previewRef.current
    if (p) {
      useVoicePlayerStore.getState().stop(PREVIEW_ID)
      URL.revokeObjectURL(p.url)
    }
    setPreview(null)
    if (phaseRef.current !== 'idle') opts.current.stopTyping()
    setPhase('idle')
    setElapsed(0)
    setLevels([])
    setDrag({ dx: 0, dy: 0 })
  }

  const begin = (locked: boolean) => {
    if (phaseRef.current !== 'idle' || stoppingRef.current) return
    const gen = ++genRef.current
    setPhase(locked ? 'locked' : 'holding')
    setElapsed(0)
    setLevels([])
    setDrag({ dx: 0, dy: 0 })
    vibrate()
    startRef.current = startRecording({
      onLevel: (level) => setLevels((prev) => [...prev.slice(-(LIVE_LEVELS - 1)), level]),
      onLimit: () => void actions.current.toPreview(),
      onError: () => {
        actions.current.reset()
        setHint('Recording stopped')
      },
    }).then(
      (r) => {
        if (genRef.current !== gen) {
          r.discard()
          return null
        }
        recorderRef.current = r
        return r
      },
      (e: unknown) => {
        if (genRef.current === gen) {
          actions.current.reset()
          setHint(errorHint(e))
        }
        return null
      },
    )
  }

  /** Stops the recorder and returns the memo, or null if it was discarded, failed, or never started. */
  const stopRecorder = async (): Promise<VoiceRecording | null> => {
    const pending = startRef.current
    stoppingRef.current = true
    try {
      const r = await pending
      if (!r) return null
      return await r.stop()
    } catch {
      return null
    } finally {
      stoppingRef.current = false
    }
  }

  const sendRecording = (recording: VoiceRecording) => {
    const authorId = useAuthStore.getState().user?.id
    const o = opts.current
    if (!authorId) return
    void sendVoiceMemo({ authorId, conversationId: o.conversationId, space: o.space, recording, replyTo: o.replyTo?.id ?? null })
    o.onSent()
  }

  /** Release after a hold, or Send while locked: stop, then send (too short: a hint instead). */
  const finishAndSend = async () => {
    const gen = genRef.current
    setPhase('idle')
    opts.current.stopTyping()
    const recording = await stopRecorder()
    if (genRef.current !== gen) return
    reset()
    if (!recording) return
    if (recording.durationMs < SHORT_TAP_MS) {
      setHint('Hold to record')
      return
    }
    sendRecording(recording)
  }

  const toPreview = async () => {
    // Stop pressed just as the limit hit: one preview, not two.
    if (stoppingRef.current || (phaseRef.current !== 'holding' && phaseRef.current !== 'locked')) return
    // A finger still down: its release does nothing now.
    gestureRef.current = IDLE
    const gen = genRef.current
    opts.current.stopTyping()
    const recording = await stopRecorder()
    if (genRef.current !== gen) return
    startRef.current = null
    recorderRef.current = null
    if (!recording) {
      reset()
      setHint('Recording stopped')
      return
    }
    setPreview({ recording, url: URL.createObjectURL(recording.blob) })
    setPhase('preview')
  }

  const send = () => {
    if (stoppingRef.current) return
    if (phaseRef.current === 'preview') {
      const p = previewRef.current
      if (!p) return
      reset()
      sendRecording(p.recording)
      return
    }
    if (phaseRef.current === 'locked') void finishAndSend()
  }

  const run = (action: GestureAction) => {
    if (action === 'start') begin(false)
    else if (action === 'start-locked') begin(true)
    else if (action === 'lock') {
      if (phaseRef.current === 'holding') {
        setPhase('locked')
        vibrate()
      }
    } else if (action === 'cancel') reset()
    else if (action === 'short-tap') {
      reset()
      setHint('Hold to record')
    } else if (action === 'send') {
      if (phaseRef.current === 'holding') void finishAndSend()
    }
  }

  const feed = (ev: GestureEvent) => {
    const { state, action } = step(gestureRef.current, ev)
    gestureRef.current = state
    if (state.mode === 'holding') setDrag({ dx: state.dx, dy: state.dy })
    run(action)
  }

  // Effects and the recorder's callbacks call through here, so they always reach this render's functions.
  const actions = useRef({ reset, toPreview })
  actions.current = { reset, toPreview }

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  // The timer, and "recording" for the other person (useTyping throttles it to every 3 s).
  useEffect(() => {
    if (phase !== 'holding' && phase !== 'locked') return
    opts.current.sendTyping('recording')
    const t = setInterval(() => {
      // Never after stopTyping: a stop or discard is under way, or the phase has just changed.
      if (stoppingRef.current || (phaseRef.current !== 'holding' && phaseRef.current !== 'locked')) return
      const r = recorderRef.current
      if (r) setElapsed(r.elapsedMs())
      opts.current.sendTyping('recording')
    }, TICK_MS)
    return () => clearInterval(t)
  }, [phase])

  // The disguise, the PIN lock and the background leave nothing behind.
  useEffect(() => {
    const end = () => {
      actions.current.reset()
      discardUnsentVoice()
    }
    const unsubscribe = useUiStore.subscribe((s, prev) => {
      if ((s.eepMode && !prev.eepMode) || (s.pinLocked && !prev.pinLocked)) end()
    })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') end()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const stopApp = onAppStateChange((active) => {
      if (!active) end()
    })
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      stopApp()
    }
  }, [])

  // Another space or conversation, or the composer going away: discard.
  useEffect(() => () => actions.current.reset(), [options.conversationId, options.space])

  return {
    phase,
    elapsedMs,
    levels,
    drag,
    preview,
    hint,
    press: {
      onPointerDown: (e) => {
        pressPhaseRef.current = phaseRef.current
        // While the last memo is still stopping, a press starts nothing (and leaves no gesture behind).
        if (phaseRef.current !== 'idle' || stoppingRef.current || e.button !== 0) return
        e.preventDefault()
        if (e.pointerType !== 'mouse') {
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // A pointer that already ended (or a synthetic one): the gesture still works on the button itself.
          }
        }
        feed({ type: 'down', pointerId: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, t: Date.now() })
      },
      onPointerMove: (e) => feed({ type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY }),
      onPointerUp: (e) => feed({ type: 'up', pointerId: e.pointerId, t: Date.now() }),
      onPointerCancel: (e) => feed({ type: 'cancel', pointerId: e.pointerId }),
      onClick: (e) => {
        // Keyboard (Enter or Space on the focused button): detail 0, and no pointer press came first.
        if (e.detail === 0 && phaseRef.current === 'idle') {
          begin(true)
          return
        }
        const sending = phaseRef.current === 'locked' || phaseRef.current === 'preview'
        const pressedAsSend = e.detail === 0 || pressPhaseRef.current === 'locked' || pressPhaseRef.current === 'preview'
        if (sending && pressedAsSend) send()
      },
    },
    stopToPreview: () => void toPreview(),
    send,
    discard: reset,
  }
}
```
Run. Expected: PASS (14 tests). Two traps to check if it fails:
- `useUiStore.setState({ eepMode: true })` must reach `subscribe` with `prev`.
- The unmount test needs the `[conversationId, space]` effect's cleanup.

- [ ] **Step 7: VoiceComposer test** `src/components/chat2/VoiceComposer.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MicButton, VoicePanel } from '@/components/chat2/VoiceComposer'
import type { VoiceSession } from '@/components/chat2/useVoiceSession'
import { WARN_AT_MS } from '@/lib/voice/recorder'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function session(over: Partial<VoiceSession> = {}): VoiceSession {
  return {
    phase: 'idle', elapsedMs: 0, levels: [0.2, 0.5], drag: { dx: 0, dy: 0 }, preview: null, hint: null,
    press: { onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn(), onClick: vi.fn() },
    stopToPreview: vi.fn(), send: vi.fn(), discard: vi.fn(), ...over,
  }
}

describe('MicButton', () => {
  it('is the mic when idle, "Release to send" while holding, Send when locked or previewing', () => {
    const { rerender } = render(<MicButton session={session()} />)
    expect(screen.getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument()
    rerender(<MicButton session={session({ phase: 'holding' })} />)
    expect(screen.getByRole('button', { name: 'Release to send' })).toBeInTheDocument()
    rerender(<MicButton session={session({ phase: 'locked' })} />)
    expect(screen.getByRole('button', { name: 'Send voice message' })).toBeInTheDocument()
  })
})

describe('VoicePanel', () => {
  it('holding: the timer and "Slide to cancel"', () => {
    render(<VoicePanel session={session({ phase: 'holding', elapsedMs: 84_000 })} isDesktop={false} />)
    expect(screen.getByText('1:24')).toBeInTheDocument()
    expect(screen.getByText('‹ Slide to cancel')).toBeInTheDocument()
  })

  it('locked: Delete, the timer, Stop; red with time left near the limit', () => {
    const s = session({ phase: 'locked', elapsedMs: WARN_AT_MS + 11_000 })
    render(<VoicePanel session={s} isDesktop={false} />)
    expect(screen.getByText('9:41 · 0:19 left')).toHaveAttribute('data-warn')
    fireEvent.click(screen.getByRole('button', { name: 'Stop and preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }))
    expect(s.stopToPreview).toHaveBeenCalled()
    expect(s.discard).toHaveBeenCalled()
  })

  it('preview: play and the length', () => {
    const recording = { blob: new Blob(), format: { mimeType: 'audio/mp4', ext: 'm4a' as const, bitsPerSecond: 1 }, durationMs: 84_000, peaks: [] }
    render(<VoicePanel session={session({ phase: 'preview', preview: { recording, url: 'blob:p' } })} isDesktop={false} />)
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeInTheDocument()
    expect(screen.getByText('1:24')).toBeInTheDocument()
  })

  it('desktop: Enter sends and Esc deletes while locked', () => {
    const s = session({ phase: 'locked' })
    render(<VoicePanel session={s} isDesktop />)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s.send).toHaveBeenCalled()
    expect(s.discard).toHaveBeenCalled()
  })
})
```
Run. Expected: FAIL.

- [ ] **Step 8: Implement** `src/components/chat2/VoiceComposer.tsx`:
```tsx
import { useEffect, type CSSProperties } from 'react'
import { ChevronUp, Lock, Mic, Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react'
import { Waveform } from '@/components/chat2/Waveform'
import { Icon } from '@/components/ui/Icon'
import { PREVIEW_ID, type VoiceSession } from '@/components/chat2/useVoiceSession'
import { formatDuration } from '@/lib/gallery'
import { CANCEL_PX, LOCK_PX } from '@/lib/voice/gesture'
import { MAX_RECORDING_MS, WARN_AT_MS } from '@/lib/voice/recorder'
import { isDisguised } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'

const FIELD = 'flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[19px] border border-[color:var(--line)] bg-[color:var(--field)] px-3'

/** The round button right of the field: the mic, growing while held (with the lock above it), then Send. */
export function MicButton({ session }: { session: VoiceSession }) {
  const { phase, drag } = session
  const sending = phase === 'locked' || phase === 'preview'
  const holding = phase === 'holding'
  const label = sending ? 'Send voice message' : holding ? 'Release to send' : 'Record a voice message'
  return (
    <div className="relative flex-none">
      {holding && (
        <span
          data-voice-lock
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[calc(100%+30px)] left-1/2 flex flex-col items-center gap-0.5 rounded-full border border-[color:var(--line)] bg-[color:var(--bar)] px-2 py-2 text-[color:var(--muted)] shadow-[0_2px_8px_var(--shadow)]"
          style={{ transform: `translate(-50%, ${Math.max(drag.dy, -LOCK_PX)}px)` }}
        >
          <Icon icon={Lock} size={16} />
          <Icon icon={ChevronUp} size={14} />
        </span>
      )}
      <button
        type="button"
        aria-label={label}
        title={sending ? 'Send' : holding ? undefined : 'Hold to record'}
        {...session.press}
        // Keeps the phone keyboard and the field's focus as they were.
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className={`grid h-[38px] w-[38px] touch-none select-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)] transition-transform [-webkit-touch-callout:none] ${
          holding ? 'scale-[1.6]' : ''
        }`}
      >
        <Icon icon={sending ? SendHorizontal : Mic} />
      </button>
    </div>
  )
}

/** Takes the field's place while recording (holding, locked) or previewing. */
export function VoicePanel({ session, isDesktop }: { session: VoiceSession; isDesktop: boolean }) {
  const { phase, elapsedMs, levels, drag, send, discard } = session

  // Desktop: Enter sends and Esc deletes while locked or previewing (the field is gone). Esc still reaches
  // AppShell's double-Esc disguise on purpose: a panicked Esc Esc must always hide the app.
  useEffect(() => {
    if (!isDesktop || (phase !== 'locked' && phase !== 'preview')) return
    const onKey = (e: KeyboardEvent) => {
      if (isDisguised() || e.isComposing) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        discard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDesktop, phase, send, discard])

  if (phase === 'holding') {
    return (
      <div data-voice-panel="holding" className="flex h-[38px] min-w-0 flex-1 items-center gap-2.5 px-2">
        <RecDot />
        <Timer ms={elapsedMs} />
        <LiveBars levels={levels} />
        <span
          aria-hidden="true"
          className="ml-auto flex-none text-[13px] text-[color:var(--muted)]"
          style={{ transform: `translateX(${drag.dx}px)`, opacity: Math.max(0.2, 1 + drag.dx / CANCEL_PX) }}
        >
          ‹ Slide to cancel
        </span>
      </div>
    )
  }

  if (phase === 'locked') {
    return (
      <div data-voice-panel="locked" className="flex min-w-0 flex-1 items-center gap-2">
        <DeleteButton onClick={discard} />
        <div className={FIELD}>
          <RecDot />
          <Timer ms={elapsedMs} />
          <LiveBars levels={levels} />
          <button
            type="button"
            aria-label="Stop and preview"
            title="Stop and preview"
            onClick={session.stopToPreview}
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full border-2 border-[color:var(--danger)] text-[color:var(--danger)]"
          >
            <Icon icon={Square} size={11} fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    )
  }

  return <PreviewPanel session={session} />
}

function PreviewPanel({ session }: { session: VoiceSession }) {
  const p = session.preview
  const status = useVoicePlayerStore((s) => (s.current === PREVIEW_ID ? s.status : null))
  const position = useVoicePlayerStore((s) => (s.current === PREVIEW_ID ? s.position : 0))
  if (!p) return null
  const total = p.recording.durationMs / 1000
  const playing = status === 'playing'
  return (
    <div data-voice-panel="preview" className="flex min-w-0 flex-1 items-center gap-2">
      <DeleteButton onClick={session.discard} />
      <div
        className={`${FIELD} pl-1.5`}
        style={{ '--wave-on': 'var(--accent)', '--wave-off': 'color-mix(in srgb, var(--muted) 45%, transparent)' } as CSSProperties}
      >
        <button
          type="button"
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          onClick={() => void useVoicePlayerStore.getState().toggle(PREVIEW_ID, p.url)}
          className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)]"
        >
          <Icon icon={playing ? Pause : Play} size={14} fill="currentColor" strokeWidth={0} />
        </button>
        <Waveform
          peaks={p.recording.peaks}
          position={position}
          duration={total}
          bars={30}
          onSeek={(s) => useVoicePlayerStore.getState().seek(PREVIEW_ID, p.url, s)}
          label="Preview position"
        />
        <span className="flex-none text-[13px] tabular-nums text-[color:var(--muted)]">{formatDuration(total)}</span>
      </div>
    </div>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Delete recording"
      title="Delete recording"
      onClick={onClick}
      className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full text-[color:var(--danger)]"
    >
      <Icon icon={Trash2} />
    </button>
  )
}

function RecDot() {
  return <span aria-hidden="true" className="h-[9px] w-[9px] flex-none rounded-full bg-[color:var(--danger)] motion-safe:animate-pulse" />
}

/** "1:24"; from 9:30, red with the time left: "9:41 · 0:19 left". */
function Timer({ ms }: { ms: number }) {
  const elapsed = formatDuration(Math.floor(ms / 1000))
  const warn = ms >= WARN_AT_MS
  const text = warn ? `${elapsed} · ${formatDuration(Math.ceil((MAX_RECORDING_MS - ms) / 1000))} left` : elapsed
  return (
    <span className="flex-none font-semibold tabular-nums">
      <span className="sr-only">Recording </span>
      <span data-warn={warn ? '' : undefined} className={warn ? 'text-[color:var(--danger)]' : 'text-[color:var(--fg)]'}>
        {text}
      </span>
    </span>
  )
}

/** The newest levels as bars, scrolling in from the right. */
function LiveBars({ levels }: { levels: number[] }) {
  return (
    <div aria-hidden="true" className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
      {levels.map((l, i) => (
        <span key={i} className="block w-[3px] flex-none rounded-[2px] bg-[color:var(--muted)]" style={{ height: `${Math.round(4 + l * 20)}px` }} />
      ))}
    </div>
  )
}

/** Desktop, under the row while locked or previewing. */
export function VoiceKeysHint() {
  return <span className="mt-1 block pl-12 text-[12px] text-[color:var(--muted)]">Enter sends · Esc deletes</span>
}

/** A short message above the composer ("Hold to record", microphone problems). */
export function VoiceHint({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="msg-in pointer-events-none absolute -top-10 right-3 z-10 max-w-[85%] rounded-full bg-[color:var(--bar)] px-3 py-1.5 text-[13px] text-[color:var(--fg)] shadow-[0_2px_8px_var(--shadow)]"
    >
      {text}
    </div>
  )
}
```
Run. Expected: PASS (5 tests).

- [ ] **Step 9: Composer test.** Add to `src/components/chat2/Composer.test.tsx` (it already mocks `useTyping`, the outbox and supabase; `canRecordVoice` is false in jsdom, so existing tests are unaffected):
```tsx
describe('voice memos in the composer', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', Object.assign(function () {}, { isTypeSupported: () => true }))
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })

  it('shows the mic instead of Send while the box is empty, and Send once there is text', () => {
    renderComposer()
    expect(screen.getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull()
  })

  it('no mic while editing', () => {
    useComposerStore.setState({ editing: msg({ author_id: 'alice' }) })
    renderComposer()
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull()
  })
})
```
(Use the file's existing render helper; if it has none, render `<Composer conversationId="conv-1" space="main" isDesktop />` with the stores set up the way its other tests do.) Run. Expected: FAIL.

- [ ] **Step 10: Implement** in `src/components/chat2/Composer.tsx`:
  - Imports:
    ```ts
    import { MicButton, VoiceHint, VoiceKeysHint, VoicePanel } from '@/components/chat2/VoiceComposer'
    import { useVoiceSession } from '@/components/chat2/useVoiceSession'
    import { canRecordVoice } from '@/lib/voice/recorder'
    ```
  - After `const { sendTyping, stopTyping } = useTyping(space)`:
    ```ts
      const [voiceSupported] = useState(canRecordVoice)
      const voice = useVoiceSession({
        conversationId,
        space,
        replyTo,
        onSent: () => onCancelReply?.(),
        sendTyping,
        stopTyping,
      })
      const recording = voice.phase !== 'idle'
    ```
  - After `canSubmit`:
    ```ts
      /** The mic takes Send's place while there is nothing to send (and the browser can record). */
      const showMic = voiceSupported && !editing && content.trim() === '' && attachments.length === 0
    ```
  - In the JSX row `<div className="flex items-end gap-2">`:
    - Wrap the field `<div className="relative flex min-h-[38px] …">…</div>` as `{recording ? <VoicePanel session={voice} isDesktop={isDesktop} /> : (…the field…)}`.
    - Replace the Send `<button>` with `{showMic || recording ? <MicButton session={voice} /> : (…the existing Send button…)}`.
  - After that row's closing `</div>`, add:
    ```tsx
            {recording && voice.phase !== 'holding' && isDesktop && <VoiceKeysHint />}
            {voice.hint && <VoiceHint text={voice.hint} />}
    ```

  Run the Composer tests. Expected: PASS (all, old and new).

- [ ] **Step 11: Gate (with e2e) and commit.**
```bash
npx tsc -b && npm run lint && npm test
npm run db:reset && E2E_PORT=<port> npm run e2e   # in the stack lock
git add src/lib/chat/outbox.ts src/lib/chat/outbox.test.ts src/lib/chat/voice.ts src/lib/chat/voice.test.ts src/components/chat2/useVoiceSession.ts src/components/chat2/useVoiceSession.test.ts src/components/chat2/VoiceComposer.tsx src/components/chat2/VoiceComposer.test.tsx src/components/chat2/Composer.tsx src/components/chat2/Composer.test.tsx
git commit -m "Record voice memos in the composer: hold, lock, preview, send; the disguise discards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
In this task's e2e, the composer shows the mic instead of Send while empty, in both browsers. If an existing e2e test clicks Send on an empty box or asserts Send is disabled, change the test to type first. Don't change the composer.

---

### Task 8: Gallery Voice row

**Files:**
- Create: `src/components/gallery/VoiceRow.tsx`, `src/components/gallery/VoiceRow.test.tsx`
- Modify: `src/components/gallery/MediaGallery.tsx` (+ test if needed), `src/components/chat/ChannelInfoPanel.tsx`

**Dependencies:** T1, T4, T5

- [ ] **Step 1: Write the failing test** `src/components/gallery/VoiceRow.test.tsx`:
```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { toggle, markPlayed, stop } = vi.hoisted(() => ({ toggle: vi.fn(async () => true), markPlayed: vi.fn(async () => {}), stop: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { VoiceRow } from '@/components/gallery/VoiceRow'
import { useAuthStore } from '@/stores/authStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { MediaItem, Profile } from '@/types'

const item = (author: string): MediaItem => ({
  id: 'mm1', message_id: 'v1', conversation_id: 'c1', space: 'main', session_id: 's1', kind: 'audio',
  url: 'https://cdn/v.m4a', filename: 'voice-1.m4a', extension: 'm4a', size: 1, spoiler: false,
  created_at: '2026-10-23T10:00:00Z', duration_ms: 84_000, author_id: author,
})
const now = new Date('2026-10-26T12:00:00Z')

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useProfileStore.setState({ profiles: { bea: { id: 'bea', nickname: 'Bea' } as Profile } })
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {}, toggle, stop })
  useVoicePlayStore.setState({ markPlayed })
  useJumpStore.setState({ pending: null })
})

describe('VoiceRow', () => {
  it('shows who and how long, then the space and date', () => {
    render(<VoiceRow item={item('alice')} now={now} dim={false} />)
    expect(screen.getByText('You · 1:24')).toBeInTheDocument()
    expect(screen.getByText(/^Main · /)).toBeInTheDocument()
  })

  it("plays, and marks the other person's memo played", async () => {
    render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    expect(screen.getByText('Bea · 1:24')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(toggle).toHaveBeenCalledWith('gallery:v1', 'https://cdn/v.m4a')
    expect(markPlayed).toHaveBeenCalledWith('v1', 'alice')
  })

  it('Show in chat asks for a jump to the message', () => {
    render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }))
    expect(useJumpStore.getState().pending).toMatchObject({ messageId: 'v1', space: 'main', created_at: '2026-10-23T10:00:00Z' })
  })

  it('stops only its own playback when it goes away (not the chat bubble\'s)', () => {
    const { unmount } = render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    unmount()
    expect(stop).toHaveBeenCalledWith('gallery:v1')
  })
})
```
Run `npx vitest run src/components/gallery/VoiceRow.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Implement** `src/components/gallery/VoiceRow.tsx`:
```tsx
import { useEffect } from 'react'
import { LoaderCircle, Pause, Play } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { formatDuration, formatItemDate } from '@/lib/gallery'
import { SPACE_LABEL } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { MediaItem } from '@/types'

/**
 * A voice memo in the gallery's Voice tab: play, "Bea · 0:42", "Main · 23 Oct", Show in chat. It plays
 * under its own player id, so closing the gallery never stops the same memo playing in the chat.
 */
export function VoiceRow({ item, now, dim }: { item: MediaItem; now: Date; dim: boolean }) {
  const id = item.message_id
  const playerId = `gallery:${id}`
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const nickname = useProfileStore((s) => (item.author_id ? s.profiles[item.author_id]?.nickname : undefined))
  const status = useVoicePlayerStore((s) => (s.current === playerId ? s.status : null))
  const failed = useVoicePlayerStore((s) => !!s.failed[playerId])
  useEffect(() => () => useVoicePlayerStore.getState().stop(playerId), [playerId])

  const mine = !!item.author_id && item.author_id === myId
  const who = mine ? 'You' : (nickname ?? '')
  const length = item.duration_ms != null ? formatDuration(item.duration_ms / 1000) : ''
  const title = [who, length].filter(Boolean).join(' · ')
  const meta = failed ? "Can't play" : [SPACE_LABEL[item.space], formatItemDate(item.created_at, now)].join(' · ')
  const playing = status === 'playing'

  const play = () => {
    void useVoicePlayerStore
      .getState()
      .toggle(playerId, item.url)
      .then((started) => {
        if (started && !mine && myId) void useVoicePlayStore.getState().markPlayed(id, myId)
      })
  }

  return (
    <div
      {...(dim ? { 'data-media-fallback': item.kind } : { 'data-media-item': item.kind })}
      className={`flex items-center gap-2.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--them)] p-2 ${dim ? 'opacity-45' : ''}`}
    >
      <button
        type="button"
        onClick={play}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)]"
      >
        {status === 'loading' ? (
          <Icon icon={LoaderCircle} size={16} className="motion-safe:animate-spin" />
        ) : (
          <Icon icon={playing ? Pause : Play} size={16} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-[color:var(--fg)]">{title}</span>
        <span className="truncate text-[11px] text-[color:var(--muted)]">{meta}</span>
      </span>
      <button
        type="button"
        onClick={() => useJumpStore.getState().request({ messageId: id, space: item.space, created_at: item.created_at })}
        className="flex-none text-[13px] font-semibold text-[color:var(--accent)] hover:underline"
      >
        Show in chat
      </button>
    </div>
  )
}
```
(Use `Loader2` if `LoaderCircle` isn't exported, as in T6.) Run. Expected: PASS (4 tests).

- [ ] **Step 3: Use it in the gallery.** In `src/components/gallery/MediaGallery.tsx`, import `VoiceRow` and change `row`:
```tsx
  const row = (item: MediaItem, dim = false) =>
    item.kind === 'link' ? (
      <LinkRow key={item.id} item={item} now={now} dim={dim} />
    ) : item.kind === 'audio' ? (
      <VoiceRow key={item.id} item={item} now={now} dim={dim} />
    ) : (
      <FileRow key={item.id} item={item} now={now} dim={dim} />
    )
```
Run `npx vitest run src/components/gallery`. Expected: PASS. If a `MediaGallery.test.tsx` case renders an `audio` item as a file link, update its expectation to the voice row ("Play voice message").

- [ ] **Step 4: Pinned and search cards.** A pinned memo is a blank card today: the card shows text, and "📎 Attachment" only for photos and GIFs. In `src/components/chat/ChannelInfoPanel.tsx`, add `import { messagePreview } from '@/lib/chat/preview'`. Then:
  - In the pinned card, replace
    ```tsx
            {message.attachments?.some((a) => a.type === 'image' || a.type === 'gif') && (
              <div className="mt-1 text-xs text-muted italic">📎 Attachment</div>
            )}
    ```
    with
    ```tsx
            {message.attachments?.length > 0 && (
              <div className="mt-1 text-xs text-muted italic">📎 {message.content ? 'Attachment' : messagePreview(message)}</div>
            )}
    ```
  - In `SearchResultCard`, replace `<span className="mt-1 block text-xs text-muted italic">📎 Attachment</span>` with `<span className="mt-1 block text-xs text-muted italic">📎 {message.content ? 'Attachment' : messagePreview(message)}</span>`.

  A memo now reads "📎 Voice message (0:42)", and a photo-only pin "📎 Photo". Nothing in the tests asserts the old text (`grep -rn "📎" src e2e`).

- [ ] **Step 5: Gate (with e2e) and commit.**
```bash
npx tsc -b && npm run lint && npm test
npm run db:reset && E2E_PORT=<port> npm run e2e   # in the stack lock
git add src/components/gallery/VoiceRow.tsx src/components/gallery/VoiceRow.test.tsx src/components/gallery/MediaGallery.tsx src/components/gallery/MediaGallery.test.tsx src/components/chat/ChannelInfoPanel.tsx
git commit -m "Gallery Voice tab: play, length, Show in chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 (lead): e2e, screenshots, device checklist, final verification

**Files:**
- Create: `e2e/voice.spec.ts`
- Modify: `e2e/stubs.ts`, `e2e/themes.spec.ts`, `docs/testing/iphone-checklist.md`

**Dependencies:** T1–T8 merged.

- [ ] **Step 1: A CDN stub that answers range requests**, so Safari can load and seek memos. In `e2e/stubs.ts`, add `import { readFileSync } from 'node:fs'` at the top. Then, at the end of `stubExternalServices` (after the generic CDN route, so it is tried first), add:
```ts
  // Voice memos: the 4 s fixture (.webm or .m4a by the URL), with range requests (Safari won't play
  // media without them).
  const fixtures = { m4a: readFileSync('e2e/fixtures/media/voice.m4a'), webm: readFileSync('e2e/fixtures/media/voice.webm') }
  await context.route('http://cdn.test.local/voice/**', (route) => {
    const webm = route.request().url().endsWith('.webm')
    const voice = webm ? fixtures.webm : fixtures.m4a
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '')
    const headers = { 'Content-Type': webm ? 'audio/webm' : 'audio/mp4', 'Accept-Ranges': 'bytes' }
    if (!range) return route.fulfill({ status: 200, body: voice, headers })
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), voice.length - 1) : voice.length - 1
    return route.fulfill({
      status: 206,
      body: voice.subarray(start, end + 1),
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${voice.length}` },
    })
  })
```

- [ ] **Step 2: Write** `e2e/voice.spec.ts`:
```ts
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
    const before = await aliceAudioCount()
    const mic = alice.page.getByRole('button', { name: 'Record a voice message' })
    await mic.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0, pointerId: 7 })
    await mic.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0, pointerId: 7 })
    await expect(alice.page.getByText('Hold to record', { exact: true })).toBeVisible()
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
```

- [ ] **Step 3: Run it.** `npm run db:reset && npx playwright test e2e/voice.spec.ts` (in the lock). Expected: PASS in `chromium-desktop` (5) and `webkit-iphone` (3 run, 2 skipped).
  - Chromium plays the WebM copy (see `voiceExt`), so the Linux CI build's codecs don't matter there.
  - If WebKit can't decode AAC on this machine, the play test fails. Look at the media element's error (add a temporary `page.on('console')`).
  - If it's a codec limit of Playwright's WebKit build and not the app, mark that one test `test.skip(browserName === 'webkit' && process.platform === 'linux', …)` with the reason, and tell the user. Device row V5 covers real iPhones.

- [ ] **Step 4: A memo in the theme screenshots.** In `e2e/themes.spec.ts`:
  - Add `const VOICE_ID = randomUUID()` next to `CODE_ID`.
  - At the top of `beforeAll`, before the code-block insert (so the code block stays newest), add:
```ts
  // A voice memo from Bea (no playback in screenshots: the bubble draws from its stored peaks).
  const { error: voiceError } = await serviceClient().from('messages').insert({
    id: VOICE_ID,
    conversation_id: IDS.conversation,
    space: 'main',
    session_id: IDS.sessions.current,
    author_id: IDS.users.bea,
    content: null,
    attachments: [
      {
        url: 'http://cdn.test.local/voice/theme.m4a',
        type: 'audio',
        filename: 'voice-theme.m4a',
        size: 24156,
        spoiler: false,
        duration_ms: 42_000,
        peaks: Array.from({ length: 48 }, (_, i) => Math.round(50 + 45 * Math.sin(i / 3))),
      },
    ],
    type: 'text',
  })
  if (voiceError) throw new Error(voiceError.message)
```
  - In `afterAll`, delete both: `.delete().in('id', [CODE_ID, VOICE_ID])`.

  The baselines change: there's a new bubble, and the empty composer now shows the mic. They are Linux-only and come from CI (SETUP.md, "Screenshot baselines"). After the PR's CI run, download the `screenshots` artifact and commit the new baselines, as was done for 3b (341a88e). Locally the file is skipped on macOS.

- [ ] **Step 5: Device checklist.** In `docs/testing/iphone-checklist.md`, add this section before "## Known open issues":
```markdown
## Voice memos (both iPhones, in the iOS app and the home-screen app, and the Mac)

| # | Check | Pass? |
|---|---|---|
| V1 | **First recording asks for the microphone:** the iOS prompt reads "XIV uses the microphone when you record audio or video." (iOS app; the home-screen app shows Safari's prompt). After allowing, hold again to record. Denying shows "Microphone access is off…" and the mic stays. | |
| V2 | **Hold, release:** hold the mic about 2 s and release. The memo sends; the other phone sees "Recording a voice message…" while you hold, then the memo with a dot. | |
| V3 | **Short tap:** a quick tap shows "Hold to record" and sends nothing. | |
| V4 | **Slide left cancels** (nothing sent); **slide up locks**: you can let go, the timer keeps running, Stop shows the preview, which plays and seeks; Send sends it, Delete discards it. | |
| V5 | **Playback:** play, pause, drag on the waveform to seek; another memo started pauses the first. A memo recorded in Chrome on the Mac plays on the iPhone, and an iPhone memo plays on the Mac. | |
| V6 | **Played marker:** when the other phone starts playing your memo, your mic turns blue within about 2 s; with either person's read receipts off, it never does. | |
| V7 | **The disguise discards:** start a locked recording, then Eep (button), lock with the PIN, and background the app, once each. Each time, nothing was sent and the microphone indicator (orange dot) is gone at once. Playback pauses under the disguise. | |
| V8 | **Silent switch on:** memos still play out loud, in both the iOS app and the home-screen app. | |
| V9 | **The 10-minute limit:** from 9:30 the timer turns red and counts down; at 10:00 the preview opens by itself, even while still holding. (Long; run it once.) | |
| V10 | **Gallery:** Media → Voice lists memos with length, space and date; play works there; Show in chat jumps to the memo. | |
```

- [ ] **Step 6: Final verification (lead), and record the results:**
```bash
npx tsc -b && npm run lint && npm test
npm run test:db && npm run test:migration
npm run db:reset && npm run e2e
npm run build && grep -c "use-fake" dist/assets/*.js || true     # expect 0: test flags never reach the site
npm run build:native                                              # with .env.native.local
npx cap sync ios && xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug build | tail -3   # expect ** BUILD SUCCEEDED **
```
Then check two things by hand in Chrome on `npm run dev`:
- **Desktop:** click the mic, speak, Stop, play the preview, Send. Then click the mic and press Esc.
- **Phone layout:** in device mode with touch, hold the mic and release.

- [ ] **Step 7: Commit.**
```bash
git add e2e/voice.spec.ts e2e/stubs.ts e2e/themes.spec.ts docs/testing/iphone-checklist.md
git commit -m "Voice memo e2e, a memo in the theme screenshots, device checks V1–V10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Nothing is pushed until the user says yes.
