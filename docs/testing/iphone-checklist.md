# iPhone Manual Checklist

Run on a real iPhone, using the app installed to the home screen, at the end of each milestone. Record the date, iOS version and the result of each item.

| # | Check | Pass? |
|---|---|---|
| 1 | App-switcher snapshot doesn't show chat content. *(Expected to fail as a PWA; the iOS app fixes it, see native row 1 below.)* | |
| 2 | Returning from the background shows the FF14 page; the blue dot opens the PIN pad and unlocks. | |
| 3 | Fast thumb entry on the PIN pad registers every digit (4- and 6-digit PINs). | |
| 4 | Wrong PIN: the dots shake and clear; the pad accepts input again straight away. | |
| 5 | Autocorrect, predictive text and auto-capitalisation work in the message box: tapping a suggestion replaces the word, the caret never jumps, and committing a word with a Japanese (or other IME) keyboard doesn't send. | |
| 6 | The keyboard doesn't cover the message box: it sits right on the keyboard with the header still in view, including after the box grows to several lines; the list stays scrolled to the bottom when the keyboard opens. | |
| 7 | A message from the other person appears without a refresh, including after the app was in the background. | |
| 8 | Safe areas are respected (notch / Dynamic Island, home indicator). | |
| 9 | Double-tap doesn't zoom; long-press doesn't select UI text or open the callout menu. | |
| 10 | Images and video play inline. | |
| 11 | Typing indicator and presence update within about 2 s. | |
| 12 | After unlocking with the PIN, a typed message sends and the other person receives it. | |
| 13 | Long-pressing a bubble (about 0.4 s) lifts it above a dimmed list with the quick-react bar and the action sheet, and buzzes where supported; scrolling that starts on a bubble still scrolls and never opens the sheet. | |
| 14 | Long-pressing a photo, video or GIF offers Mark as spoiler / Remove spoiler for that item; the other phone blurs or unblurs it live. A long-press on a photo doesn't also open it full screen. | |
| 15 | Return in the message box adds a new line and never sends, with a Bluetooth keyboard too; the round Send button sends and the keyboard stays open. The box grows to 6 lines, then scrolls. | |
| 16 | Attaching a photo shows its thumbnail with a spinner; the eye toggle marks it as a spoiler and the other phone shows it blurred. Editing a message opens it in the box under "Editing message"; the tick saves it. | |
| 17 | The red **Eep!** button in the chat header shows the FF14 page at once; the passphrase (or the blue dot and PIN) brings the chat back. | |
| 18 | With a PIN set, launching the app from the home screen opens on the FF14 page, locked; the PIN unlocks it. Without a PIN it opens on the chat. | |
| 19 | In the chat, the status bar matches the chosen theme's bar (check a light and a dark theme; it follows a theme switch). On the FF14 page it always has the disguise's own colour, never a hint of the chat theme. | |
| 20 | Turning the phone to landscape keeps the phone layout (one screen at a time, Send button), even though it is wider than the desktop breakpoint. | |
| 21 | **Profile:** crop an avatar and a banner on the device, including a portrait photo from the camera roll (it crops the right way up, not sideways); Save shows the result on the other phone. | |
| 22 | **Emoji picker:** the panel over the keyboard area doesn't hide the composer; long-pressing a custom emoji offers Delete. | |
| 23 | **Add emoji:** adding an emoji from the photo library works, including a GIF, and from a photo taken with the camera; the other phone sees it without a refresh. | |
| 24 | **Photo picker cancel:** open the photo picker (profile or Add emoji), cancel it once, then try again: it opens and the chosen photo is used. | |
| 25 | **Viewer:** swipe between photos; "Show in chat" switches space if needed, scrolls to the message and highlights it. | |
| 26 | **Settings:** every section opens and Back returns. | |
| 27 | **Log out:** Log out from Settings lands on the login screen; the FF14 screen's Logout still works. | |

## Native app (simulator first, then both iPhones through TestFlight)

The iOS app (`npm run ios:sim` locally; [TestFlight runbook](../ios/testflight-runbook.md)). Record the date, the device or simulator model, the iOS version and each result. The web rows above still apply to the app.

| # | Check | Pass? |
|---|---|---|
| N1 | **App switcher:** with the chat open, swipe up to the switcher. The card shows the FF14 picker, never the chat. Repeat with a sheet open (profile, emoji picker, media viewer) and with the in-app Safari view open from a link. | |
| N2 | **Cold start:** the launch screen is the FF14 picker. With a PIN, the app opens on the FF14 page, locked. | |
| N3 | **Resume:** background the app, send a message from the other user (desktop), and return. The disguise is up. After unlocking, the message is there without a refresh. Presence shows "online" again within a few seconds. | |
| N4 | **Keyboard:** the composer sits on the keyboard with the header in view, the same as item 6. | |
| N5 | **Photos:** pick from the library (avatar, Add emoji, composer); take a photo with the camera, and record a video from the composer's camera option *(device only)*; the permission prompts use the neutral texts. | |
| N6 | **Links:** a link in a message opens in the Safari view. Closing it returns to the chat. | |
| N7 | **Status bar text:** light on dark themes and the disguise, dark on light themes. It follows a theme switch. | |
| N8 | **Live update:** the procedure below. The new bundle is applied after backgrounding, and About shows the changed string. | |
| N9 | **Rollback:** the procedure below. The app comes back on the previous bundle within about 10 s, and later checks don't download the broken version again. | |
| N10 | **Interruptions aren't "background":** with a sheet open (the avatar crop), pull down Control Center and dismiss it, and answer the first photo or camera permission prompt. The sheet is still there and the disguise did not come up. | |
| N11 | **Update applied in the background:** queue an update (N8) with a half-typed message in the box, then background the app for a minute. Check twice, once as a user with a PIN and once with only the passphrase. On return, the disguise is up in both cases. The other user saw this device go offline and doesn't see it online while it was away. Note whether the half-typed message survived (it may not; record the result). | |

### Live update procedure (simulator)

1. `.env.native.local` = the `.env.test` values plus `VITE_NATIVE_UPDATE_URL=http://localhost:8080`.
2. Run `npm run ios:sim` (this installs bundle A).
3. Change a visible string (e.g. the About "Built" label to "Built (B)"), then run `docker compose build` with the same `VITE_*` values exported, and `docker compose up -d`.
4. Background and resume the app. Background it again and resume. "Built (B)" shows.
5. Revert the string.

### Rollback procedure

1. With the container from the live-update procedure running, build a bundle that never renders, on the host:
   ```bash
   B=$(mktemp -d) && echo '<!doctype html><script>throw new Error("bad bundle")</script>' > "$B/index.html"
   (cd "$B" && zip -qX bad.zip index.html)
   SUM=$(shasum -a 256 "$B/bad.zip" | cut -d' ' -f1)
   V="0.1.0-$(date -u +%Y%m%d%H%M%S)"
   docker compose cp "$B/bad.zip" "app:/usr/share/nginx/html/native/bundle-$V.zip"
   printf '{"version":"%s","url":"bundle-%s.zip","checksum":"%s","minNative":"1.0.0"}\n' "$V" "$V" "$SUM" > "$B/latest.json"
   docker compose cp "$B/latest.json" app:/usr/share/nginx/html/native/latest.json
   ```
2. Background and resume the app, then background and resume it again. The broken bundle loads, and after about 10 s the app comes back on the previous bundle.
3. Resume once more. Safari Web Inspector shows `[updates] … failed-before` and no new download of that version.
4. `docker compose up -d --build` puts the real bundle back.

## Known open issues

- The old message box set `autoCorrect="off"`, which explained item 5 failing. The redesign 3a composer (`src/components/chat2/Composer.tsx`) turns it on; confirm on a device. (2026-10-19)
- Send-after-unlock (item 12) doesn't reproduce in WebKit emulation after Task 8 (duplicate desktop and mobile layouts on phones, which tore down the shared realtime channel) and Task 15 (new messages were never broadcast). Those are the likely real causes. Confirm on a device. (2026-10-19)
- Production's `reactions` table lacks `REPLICA IDENTITY FULL` (the old `00009` migration was never applied). Removing a reaction may not sync to the other person. To be addressed in sub-project 2.
- Swipe to reply (swipe a bubble right) is left out of 3a (Task 10), per the design's escape hatch. Try it later on a device: it must not fight the list's vertical scroll or iOS's edge-swipe back gesture.
- 3b (2026-10-20): items 21–27 are new. Emoji 16 glyphs need iOS 18.4 or later; on an older iOS they show as boxes (updating iOS fixes it). Skin tones are left out by choice.
