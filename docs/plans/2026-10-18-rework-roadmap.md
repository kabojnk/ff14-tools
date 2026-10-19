# Chat Rework — Roadmap

**Date:** 2026-10-18
**Status:** Active. Sub-projects 1 and 2 built; sub-project 3 next.

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
| 2 | Data model: channels → conversations (**built 2026-10-19**; expand only, contract pending) | 1 | `2026-10-19-conversations-data-model-design.md`, plan `2026-10-19-conversations-data-model-plan.md` |
| 3 | Chat UX rebuild (Messenger-style, polished, mobile-first) | 1, 2 | not yet written |
| 4 | iOS native research (Capacitor vs React Native, distribution without the App Store) | — (runs alongside) | not yet written |

## Requirements captured for later sub-projects

### Sub-project 2: data (built)

Built as one conversation with two fixed spaces (Main, Schist), shared status definitions, a media index, a hashed PIN and lake password, and compatibility triggers so a cached old app keeps working. The requirements below are kept for reference. Release steps: `docs/testing/release-rehearsal.md`.

**Contract checklist** (a separate migration, run once both phones are on the new app after the production release):
- [ ] Drop `channels`, `messages.channel_id`, `sessions.channel_id`, `pinned_messages.channel_id`.
- [ ] Drop `profiles.lock_pin` (plain text), `profiles.status` (the custom values), `profiles.custom_status_emoji`, `status_definitions.legacy_key`.
- [ ] Drop `change_sheets`, `get_channel_messages` and the compatibility triggers and functions.
- [ ] Make `conversation_id` and `space` NOT NULL.

**Known open issues** (accepted; details in the plan):
- The plain-text `lock_pin` stays readable by members until contract, because old apps check it locally.
- `lock_pin_length` is visible to other members (reveals PIN length only).
- Reaction delete events under RLS carry only the primary key, so a filtered DELETE subscription can miss them. Reactions are redesigned in sub-project 3.
- A cached old app doesn't receive live messages from the new app (it only listens to public broadcasts nothing sends any more); it catches up on refetch. Only matters during the release window.
- No attempt limit on `verify_pin` / `fill_the_lake`.

Original requirements:
- `conversations` with n participants (usually 2) replace `channels`. Existing channels are merged into one conversation, or kept as tabs (to be decided in the sub-project 2 design).
- `sessions` (Drag the Lake), `messages`, `reactions`, and `pinned_messages` re-pointed to conversations.
- Shared **status definitions** table: custom statuses with a label and colour that anyone can create or edit. It replaces the hardcoded `profiles_status_check` values (`under_close_watch`, `found_out`, `you_can_call`, `potential_eep`).
- Status message stays as free text; `custom_status_emoji` is no longer used in the UI.
- Media filtering by type (image / video / GIF / file) needs an efficient query path over `messages.attachments`.
- **Security:** hash `profiles.lock_pin`, which is currently plain text and readable by every signed-in user. Add `lock_pin_length` and verify the PIN through a server-side RPC.
- Presence is per device, not per user (see sub-project 3).
- Production `reactions` lacks `REPLICA IDENTITY FULL` (the old `00009` migration was never applied), so reaction-removal events may not carry the row. Decide whether to add it as a migration.

### Sub-project 3: UX
- **Carried over from sub-project 2:**
  - Seen marker: show where the other person has read up to (read receipts are stored and respect the `read_receipts` setting; nothing displays them yet).
  - Status pill: show the shared coloured status next to names consistently.
  - Main | Schist toggle design (today they are two entries in the space list).
  - Reaction delete events under RLS (see sub-project 2's open issues): redesign reactions so removals arrive live, e.g. one conversation-level subscription or broadcasts instead of a channel per message.
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
