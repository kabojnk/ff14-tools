# Voice memos (sub-project 5) design

Date: 2026-10-23 · Roadmap: [2026-10-18-rework-roadmap.md](2026-10-18-rework-roadmap.md) ("Sub-project 5: voice memos") · Mockups (approved 2026-10-23): https://claude.ai/artifact/98F6wvMviHuxPohmZZFhR7 · Builds on `main` (3a, 3b and the iOS app merged)

## Problem

Discord-style voice messages: record, preview, send, play. No calling. It must work on the desktop web app, the iPhone home-screen app and the iOS app. The groundwork already exists:
- `message_media.kind` accepts `audio`
- the gallery has a Voice chip with an empty state
- the composer has a place for a mic button
- `preview.ts` says "Voice message"

## Decisions (user, 2026-10-23)

| Question | Answer |
|---|---|
| How recording works | **Hold to record** (WhatsApp style): release sends, slide left cancels, slide up locks hands-free; a locked recording can be stopped for a preview |
| Extras on the bubble | **Played marker** only (no playback speed, no auto-play of the next memo) |
| Disguise during a recording | **Stop and discard** |
| Spoilers | **No** spoiler option on voice memos |
| Look | The mockups linked above, as drawn |

Proposed with the mockups and approved with them:
1. The mic replaces Send while the message box is empty.
2. A short tap shows "Hold to record" and records nothing.
3. On desktop a click starts a locked recording at once. Enter sends, Esc deletes.
4. At 10:00 recording stops and shows the preview, even while holding. The timer turns red with a countdown for the last 30 s.
5. The disguise discards an unsent preview too.
6. "Played" follows the read-receipts setting.
7. The other person sees "Recording a voice message…".
8. One memo plays at a time, and playback pauses when the disguise comes up.

## Behaviour

### Composer states

```
idle (box empty: mic shown) ──press──▶ holding ──release──▶ sending
                                         │ slide left ≥ 120 px ──▶ discarded
                                         │ slide up ≥ 80 px ──▶ locked ──Send──▶ sending
                                         │                        │ Stop ──▶ preview ──Send──▶ sending
                                         │                        │ Delete ──▶ discarded
                                         │                                  └─ Delete ──▶ discarded
                                         └ released before 0.5 s ──▶ "Hold to record" hint, nothing kept
desktop: click ──▶ locked (Enter = Send, Esc = Delete)
any state ── disguise / background / Eep / lock ──▶ discarded (mic released at once)
10:00 reached (holding or locked) ──▶ preview
```

- **Mic button:** shown in place of Send while the box is empty, there are no pending attachments and no edit is open. Typing turns it back into Send.
- **Holding (phone):** the composer row shows a red dot, the timer, small live level bars and "‹ Slide to cancel". The mic grows under the thumb, with a lock pill above it. A light haptic on start and on lock, where supported.
- **Locked:** Delete (danger), a field with the red dot, timer, scrolling live bars and Stop, and the Send button.
- **Preview:** Delete, a field with play/pause, the scrub-able waveform and the duration, and Send.
- **Limit:** the timer turns `--danger` with "0:19 left" from 9:30. Recording stops at 10:00 and goes to the preview.
- **Disguise:** any of these discards the recording or preview and releases the microphone:
  - Eep (button, `/eep` or shortcut)
  - the app going to the background (`visibilitychange` hidden, or the iOS app's `onAppStateChange(false)`)
  - the PIN lock coming up

  Nothing about the memo survives.
- **Permission denied or no mic:** a toast, "Microphone access is off", with one neutral line on where to turn it on (the iOS app's Settings entry, or Safari's website settings). The composer goes back to idle.

### Sending

- A voice memo is a message with **empty text** and **one attachment**:

  ```json
  { "url": "…/voice/<uuid>.m4a", "type": "audio", "filename": "voice-<uuid>.m4a",
    "size": 812345, "spoiler": false, "duration_ms": 42150, "peaks": [12, 40, …] }
  ```

  `peaks` is 48 values from 0–100 (the waveform), taken from the recording's levels. Messages already store attachments as free-form JSON, so this needs no schema change.
- **Upload:** through the existing `upload-media` function (25 MB limit, enough for 10 minutes), into the `voice/` folder. Sending looks like a photo upload: the memo appears as a pending bubble with a spinner, then as sent.
- **Format:** `MediaRecorder` with the first supported of:
  1. `audio/mp4;codecs=mp4a.40.2` (AAC, 128 kbps)
  2. `audio/mp4`
  3. `audio/webm;codecs=opus` (96 kbps)
  4. `audio/webm`

  The file extension follows the type (`.m4a` or `.webm`).
- **Typing indicator:** while recording, the existing `typing` broadcast carries `activity: 'recording'`. The other side shows the mic and "Recording a voice message…" instead of the dots. `typing_stop` clears it as today. A cached old app ignores the extra field and shows "typing".

### The bubble

- **Layout:**
  - **Theirs:** play/pause on accent, 34–40 bars, the duration, and the time.
  - **Mine:** the same in the `--me` colours, plus a small mic before the duration and the ticks.
- **Playing:** bars up to the position turn accent, with a thumb, and the time shows `elapsed / total`. The waveform is a slider:
  - tap or drag to seek
  - arrow keys step 5 s
  - `role="slider"` with `aria-valuetext` such as "0:07 of 0:19"
- **One at a time:** starting one memo pauses any other. Playback pauses on the disguise, when the app goes to the background and when the conversation changes.
- **Played marker:**
  - On **my** memo, the mic turns `--tick` once the other person has started playing it.
  - On **theirs**, an accent dot shows next to the duration until I play it.
  - Starting playback of someone else's memo marks it played.
- **Message actions:** reply, react, pin, copy link and delete work as for any message, and there is no spoiler.
  - Replies and the conversation list show "Voice message (0:42)".
  - Edit is not offered for voice memos.

### Gallery

- The Voice tab lists memos by month.
- Each row has a play button, "You · 1:24" or "Bea · 0:42", "Main · 23 Oct", and "Show in chat".
- It uses the same one-at-a-time player.

## Data

One additive migration, `…_voice_memos.sql`:

- **`voice_plays`**: `(message_id → messages on delete cascade, user_id → auth.users, played_at timestamptz default now(), primary key (message_id, user_id))`.
  - **Select:** your own rows always. Someone else's only when **both** of you have `read_receipts` on (the same rule as `read_positions`).
  - **No direct writes.**
- **`mark_voice_played(p_message uuid)`** (security definer):
  - The caller must be a member of the message's conversation, and the message must have an `audio` attachment and not be the caller's own.
  - It inserts with `on conflict do nothing`.
- **Realtime:** `voice_plays` is added to the `supabase_realtime` publication. The app listens on the existing `conv:<id>` channel, and RLS filters what each person receives.
- **Gallery duration:** `message_media` gains `duration_ms int null`. Its sync trigger copies `duration_ms` from the attachment, and `get_media` returns it.
- **pgTAP tests:**
  - the receipts rule both ways
  - non-members are refused
  - your own memo, and a message with no audio, are refused
  - marking twice keeps one row
  - deleting a message removes its plays

The migration is added to the owner checklist's release-day list.

## Architecture

| Unit | Responsibility |
|---|---|
| `src/lib/voice/recorder.ts` | Wraps `getUserMedia` + `MediaRecorder`. Picks the type and bitrate, collects chunks, measures levels with an `AnalyserNode` (live bars plus the 48 peaks), and handles the limit and `discard()`. It always stops every track. It has no React, so it can be unit-tested with a fake `MediaRecorder` |
| `src/lib/voice/gesture.ts` | A pure state machine for hold / slide-cancel / slide-lock / short-tap from pointer events, with thresholds as constants. Unit-tested with event sequences |
| `src/components/chat2/VoiceComposer.tsx` | The holding, locked and preview UI. It mounts inside the Composer in place of the field row while recording, and owns the disguise and background discard |
| `src/stores/voicePlayer.ts` | One shared `HTMLAudioElement`: current memo, position, play/pause/seek. It pauses on the disguise and on background |
| `src/components/chat2/VoiceBubble.tsx` | The waveform slider, played marker and duration. Used by `MediaBlock` for `audio` attachments, and by the gallery row |
| `src/stores/voicePlays.ts` | The loaded page's plays (one query, like reactions), the realtime inserts, and `markPlayed()` |

## Error handling

- **Microphone permission denied, no microphone, or `MediaRecorder` missing:** a toast, back to idle. The mic button stays (a later attempt can succeed).
- **Recorder error mid-recording:** discard, and a toast saying "Recording stopped".
- **Upload fails:** the pending bubble shows "Not sent · Retry" like a failed photo. The recorded file is kept in memory until Retry or Delete. A disguise still discards it.
- **Playback fails** (bad file, offline): the bubble shows "Can't play" and the play button retries.
- **`mark_voice_played` fails:** ignored, and tried again on the next play.

## Testing

- **Unit (Vitest):**
  - `gesture.ts`: all transitions, thresholds, short tap, the desktop click
  - `recorder.ts`: type choice order, limit to preview, discard stops tracks, peaks length and range (fake `MediaRecorder` and `AnalyserNode`)
  - `voicePlayer`: one at a time, pause on disguise
  - `VoiceBubble`: slider keyboard and ARIA, played marker states
  - `VoiceComposer`: mic shown only when the box is empty; Eep or background discards
  - `voicePlays`: the realtime insert handling
- **Database (pgTAP):** as listed under Data.
- **E2E (Playwright):**
  - **Chromium:** with fake media (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`), Alice records with a click (desktop, locked), sends, and Bea sees the bubble live with the unplayed dot. Bea plays it, and Alice's mic turns played. Then Eep mid-recording discards (nothing sent, no bubble).
  - **WebKit (iPhone project):** playback, the gallery Voice row and Show in chat, using a seeded audio message. WebKit can't fake a microphone, so recording on iPhone is a device check.
  - **Theme screenshots:** a voice bubble is added to the seed so the screenshots cover it. CI regenerates the baselines.
- **Device checks** (`docs/testing/iphone-checklist.md`, new rows):
  - hold, slide-cancel, slide-lock and preview
  - the 10-minute limit
  - recording in the iOS app and in the home-screen app (permission prompts)
  - a memo recorded in Chrome on the Mac plays on the iPhone, and the other way round
  - the disguise discards
  - playback with the silent switch on
  - the played marker reaches the other phone

## Checked during planning

- **Recording formats:** which `MediaRecorder` types Chrome (Mac and Windows), Safari 18 and WKWebView actually offer, and that the chosen output of each plays on the others. A Chrome-recorded file must play on iOS. Transcoding is out of scope. So if some browser can only record a type the iPhones can't play, the plan hides the mic on that browser (playback still works) and reports it.
- **Bunny file type:** that Bunny serves `.m4a` and `.webm` with audio content types and range requests, so Safari can seek. `upload-media` uploads as `application/octet-stream`, so this relies on Bunny's own type-by-extension.
- **Silent switch:** whether an `<audio>` element plays with the silent switch on, in the iOS app and the home-screen app.

## Concerns checklist

| Concern | Applies | Notes |
|---|---|---|
| Error handling | Yes | Above |
| Security | Yes | RLS on `voice_plays`, writes only through the membership-checked RPC. Uploads use the existing function and limit. The microphone is only active while a recording UI is visible, and is released on the disguise |
| Privacy / disguise | Yes | The disguise discards recordings and previews and pauses playback. Played receipts follow the existing setting. The permission texts stay neutral: "XIV uses the microphone when you record a video" becomes "…when you record audio or video". That is an Info.plist change, so it reaches the phones with the first TestFlight build, which hasn't been uploaded yet |
| Database / migrations | Yes | One additive migration. The old app keeps working, and an `audio` attachment shows there as a file link during the release window |
| Test strategy | Yes | Above |
| Performance | Minor | One shared audio element. Peaks are stored, so no decoding to draw waveforms. Files are about 1 MB per minute |
| Accessibility | Yes | Real buttons, a slider with value text, a keyboard path on desktop (click, Enter, Esc). Hold-to-record has the locked path for people who can't hold |

## Out of scope

- Playback speed, auto-play of the next memo, transcripts.
- Voice calls.
- Trimming or editing a recording.
- Native recording through a Capacitor plugin (the web recorder works in WKWebView).
