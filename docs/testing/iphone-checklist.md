# iPhone Manual Checklist

Run on a real iPhone, using the app installed to the home screen, at the end of each milestone. Record the date, iOS version and the result of each item.

| # | Check | Pass? |
|---|---|---|
| 1 | App-switcher snapshot doesn't show chat content. *(Expected to fail as a PWA; tracked by sub-project 4.)* | |
| 2 | Returning from the background shows the FF14 page; the blue dot opens the PIN pad and unlocks. | |
| 3 | Fast thumb entry on the PIN pad registers every digit (4- and 6-digit PINs). | |
| 4 | Wrong PIN: the dots shake and clear; the pad accepts input again straight away. | |
| 5 | Autocorrect, predictive text and auto-capitalisation work in the message box. | |
| 6 | The keyboard doesn't cover the message box; the list stays scrolled to the bottom when the keyboard opens. | |
| 7 | A message from the other person appears without a refresh, including after the app was in the background. | |
| 8 | Safe areas are respected (notch / Dynamic Island, home indicator). | |
| 9 | Double-tap doesn't zoom; long-press doesn't select UI text or open the callout menu. | |
| 10 | Images and video play inline. | |
| 11 | Typing indicator and presence update within about 2 s. | |
| 12 | After unlocking with the PIN, a typed message sends and the other person receives it. | |

## Known open issues

- The message box sets `autoCorrect="off"` (`src/components/chat/MessageInput.tsx`), which explains item 5. This is fixed in sub-project 3.
- Send-after-unlock (item 12) doesn't reproduce in WebKit emulation after Task 8 (duplicate desktop and mobile layouts on phones, which tore down the shared realtime channel) and Task 15 (new messages were never broadcast). Those are the likely real causes. Confirm on a device. (2026-10-19)
- Production's `reactions` table lacks `REPLICA IDENTITY FULL` (the old `00009` migration was never applied). Removing a reaction may not sync to the other person. To be addressed in sub-project 2.
