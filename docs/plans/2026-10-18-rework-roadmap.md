# Chat Rework — Roadmap

**Date:** 2026-10-18
**Status:** Active. Sub-project 1 in design.

## Goal

Turn the Discord-style chat into a polished, reliable WhatsApp/Messenger-style messenger for (usually) two people, hidden behind the unchanged FF14 Tools veneer (Eep mode). Works well in desktop browsers and on iPhone.

## Hard constraints

- **The FF14 veneer is untouched.** Eep mode, the passphrase unlock, and the "messaging accessible through obscurity" behaviour stay as they are. (The PIN pad is rebuilt for polish and reliability; the flow it belongs to does not change.)
- **Preserve DB contents.** Existing data migrates; nothing is dropped. Channels may be merged into a single conversation.
- **Drag the Lake keeps working** in the new structure (hide all visible history in a conversation and start a clean session; recoverable from the DB).

## Sub-projects (in order)

| # | Sub-project | Depends on | Spec |
|---|---|---|---|
| 1 | Test foundation: local Supabase, Vitest, two-user Playwright, CI, PIN pad rebuild (**built 2026-10-19**) | — | `2026-10-18-test-foundation-design.md` |
| 2 | Data model: channels → conversations | 1 | not yet written |
| 3 | Chat UX rebuild (Messenger-style, polished, mobile-first) | 1, 2 | not yet written |
| 4 | iOS native research (Capacitor vs React Native, distribution without the App Store) | — (runs alongside) | not yet written |

## Requirements captured for later sub-projects

### Sub-project 2: data
- `conversations` with n participants (usually 2) replace `channels`. Existing channels are merged into one conversation, or kept as tabs (to be decided in the sub-project 2 design).
- `sessions` (Drag the Lake), `messages`, `reactions`, and `pinned_messages` re-pointed to conversations.
- Shared **status definitions** table: custom statuses with a label and colour that anyone can create or edit. It replaces the hardcoded `profiles_status_check` values (`under_close_watch`, `found_out`, `you_can_call`, `potential_eep`).
- Status message stays as free text; `custom_status_emoji` is no longer used in the UI.
- Media filtering by type (image / video / GIF / file) needs an efficient query path over `messages.attachments`.
- **Security:** hash `profiles.lock_pin`, which is currently plain text and readable by every signed-in user. Add `lock_pin_length` and verify the PIN through a server-side RPC.
- Presence is per device, not per user (see sub-project 3).
- Production `reactions` lacks `REPLICA IDENTITY FULL` (the old `00009` migration was never applied), so reaction-removal events may not carry the row. Decide whether to add it as a migration.

### Sub-project 3: UX
- Messenger/WhatsApp layout: conversation list (or tabs) plus the conversation view; not Discord-style.
- Polished typing experience. Native autocorrect and predictive text must work on iOS (no interference from controlled inputs, `autocorrect`/`autocapitalize`/`spellcheck` set correctly).
- Reliable auto-scroll to the newest message, reliable live delivery of new messages, and unread indicators.
- Consistent presence and typing with multiple devices per user. Today presence is keyed by user ID, so one device going to the background marks the user offline everywhere. Fix by keying per device and taking the most-online status across a user's devices.
- Subtle, polished animations (message send/arrive, typing dots), not over the top.
- GIF search (Klipy) and photo and video uploads (Bunny) kept.
- Media gallery with filtering by type.
- Profile editing: nickname, avatar, banner, status message (text only), custom coloured statuses.
- Global custom emoji that any user can add easily, keeping the `:name:` text tokens.
- Fully responsive. Mobile UX gets equal attention (safe areas, keyboard overlap, touch targets).
- **Themes** beyond light and dark, based on well-known palettes, with at least two pink variants. Candidates: Light, Dark, Midnight (existing), Catppuccin Latte / Mocha, Rosé Pine / Rosé Pine Dawn (pink), Sakura (soft pink light theme), Dracula, Nord, Tokyo Night. Built on the existing `data-theme` + CSS variable approach, so every theme is just a token set. Each theme must meet WCAG AA contrast for text, and the end-to-end tests take a screenshot of each theme. The exact list is decided in the sub-project 3 design.

### Sub-project 4: iOS research
- Goal: hide sensitive content in the iOS app switcher, which a PWA cannot reliably do because iOS takes the snapshot before web content redraws.
- Compare Capacitor (wrap the existing web app and add a native privacy overlay on `willResignActive`) with React Native / Expo (rewrite).
- Distribution to one other person without public App Store release: compare EAS internal/ad-hoc distribution ($99/yr developer account, register the other person's device UDID), TestFlight, and free-Apple-ID sideloading from Windows (AltStore / Sideloadly, 7-day re-signing).
- The deliverable is a written recommendation, not an implementation.

### Later: voice memos (after sub-project 3)
- Discord-style voice messages: record, preview, send. **No voice calling.**
- Maximum length under 10 minutes, with a visible timer and an automatic stop at the limit.
- Decent quality with no heavy compression: Opus at about 96 kbps where the browser supports it (Chrome), AAC (`audio/mp4`) at about 128 kbps on iOS Safari, which is what `MediaRecorder` produces there. Ten minutes comes to roughly 7–10 MB, so check the `upload-media` size limit and Bunny settings.
- Shown as a playable bubble with a waveform, scrubbing and the duration; uploaded to Bunny as a new `audio` attachment type.
- Must work in the iPhone home-screen app (microphone permission flow) and on desktop.
- Gets its own short design when the time comes.

## Follow-ups outside the current scope
- Rotate the Eep passphrase on the live project. It is committed in `supabase/migrations/00007_create_settings.sql` and is therefore in git history.
