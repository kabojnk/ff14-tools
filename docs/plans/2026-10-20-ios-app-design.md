# iOS app (sub-project 4) design

Date: 2026-10-20 · Roadmap: [2026-10-18-rework-roadmap.md](2026-10-18-rework-roadmap.md) · Research: [2026-10-19-ios-native-research.md](2026-10-19-ios-native-research.md) · Builds on `feat/redesign-3b`

## Problem

On an iPhone the chat runs as a home-screen web app. iOS takes the app-switcher snapshot before a web app can repaint, so the switcher card can show the chat instead of the FF14 disguise. The research found no web-only fix. A thin native wrapper can cover the screen in time.

## Decisions (user, 2026-10-20)

| Question | Answer |
|---|---|
| Wrapper and distribution | Capacitor 8 + TestFlight internal testing (decided 2026-10-19) |
| How web changes reach the app | **Self-hosted live updates**, built into the normal Docker deploy |
| Native push notifications | **None.** Messages arrive only while the app is open, as today |
| App-switcher card | **The FF14 picker screen** (a still image of the real disguise) |
| The website (PWA) | **Kept** for the Mac and the Windows PC; the native app is for the iPhones |
| Apple Developer Program | **Not enrolled yet.** Everything up to signing is built and tested in the simulator; the TestFlight steps wait for enrolment |
| Account holder name | Deferred to enrolment. An individual account shows the holder's legal name as the team in TestFlight |

## Approach

Wrap the existing web app with Capacitor 8 (`@capacitor/core`/`ios`/`cli` 8.5.x). About 95% of the code carries over. The native app loads the web bundle from inside the app, not from the website, so it opens offline and on a bad connection.

**Rejected:** loading the live website with `server.url` (Capacitor documents it as not for production, and the app would be blank offline); a React Native rewrite (weeks of work, no privacy gain); rebuilding and uploading to TestFlight for every web change (slow and manual); Capgo Cloud (paid, and a third party would host the bundle).

## Architecture

### 1. Two builds from one codebase

- `vite build` (the website): unchanged, including the PWA service worker.
- `vite build --mode native` (the app): the service worker is not registered (the updater owns bundle updates, and a service worker inside the app's web view would serve stale files). The output goes to `dist-native/`, which Capacitor copies into the app.
- `src/lib/platform.ts`: `isNativeApp()` (from `Capacitor.isNativePlatform()`), so native-only code paths are explicit and unit-testable.
- The `ios/` Xcode project is committed. Display name "XIV", the existing icon, portrait only. The bundle identifier is chosen at enrolment (a placeholder until then).

### 2. App-switcher privacy

- `@capacitor/privacy-screen` 2.0.1, enabled at startup with `ios: { blurEffect: 'none' }`. On `willResignActive` it covers the window with the app's **`Splash`** image asset before iOS takes the snapshot (checked in the plugin source).
- The `Splash` asset is a screenshot of the real FF14 Random Content Picker, regenerated from the app by a script so it matches the disguise. It also serves as the launch screen, so a cold start shows the disguise first.
- The existing JavaScript behaviour stays as the second layer: going to the background turns Eep mode on and arms the PIN on phones, and `#privacy-screen` still shows.

### 3. Resume and reconnect

- `@capacitor/app` `appStateChange` is the native "became active / resigned active" signal. On `isActive: false`: the same steps as today's `visibilitychange(hidden)` (device offline, last seen, Eep on). On `isActive: true`: device online, then realtime channels and the message list catch up.
- In the native app these replace the web events, which WKWebView does not deliver reliably. The website keeps using the web events.
- One `useAppLifecycle` hook owns this, so presence, the message list and the stores subscribe to one source.

### 4. Live updates (self-hosted)

- **Plugin:** `@capgo/capacitor-updater` 8.x in **manual mode**: `autoUpdate: false`, **`statsUrl: ''`** and `updateUrl`/`channelUrl` unused, so the app never contacts Capgo's servers (by default the plugin sends update and health statistics to `plugin.capgo.app`).
- **Publishing:** the Docker build stage also runs the native build, zips it, and writes `/native/latest.json` next to `/native/bundle-<version>.zip` in the nginx image:
  ```json
  { "version": "0.1.0+20261020.1", "url": "https://<host>/native/bundle-….zip", "checksum": "<sha256>", "minNative": "1.0.0" }
  ```
  `<host>` is the website's origin, given to the native build as `VITE_NATIVE_UPDATE_URL` (a Docker build arg like the other `VITE_*` values). `version` is unique per deploy (the package version plus a build stamp). `minNative` is the oldest native shell the bundle works with (raised when a bundle needs a new plugin).
- **In the app:**
  - On launch and on every resume, `checkForUpdate()` fetches `latest.json` (no-store). If the version is new and `minNative` is satisfied, it downloads the zip with the checksum and calls `next()`, so the bundle is applied the next time the app goes to the background or is relaunched. That happens behind the disguise, so the user never sees a reload mid-conversation.
  - `notifyAppReady()` runs once the app has rendered. If a new bundle doesn't call it within `appReadyTimeout`, the plugin rolls back to the previous bundle.
  - Any failure (offline, bad JSON, checksum mismatch) is logged and ignored; the current bundle keeps running.
- **nginx:** `/native/latest.json` with `Cache-Control: no-store`; zips immutable.
- **TestFlight expiry:** builds expire after 90 days, so a native build is uploaded at least every ~80 days even when only web code changed (runbook).

### 5. Phone polish

- **Keyboard:** `@capacitor/keyboard` with the web view resized by the keyboard, so the composer and the phone emoji panel sit above it.
- **Status bar:** `@capacitor/status-bar` follows the theme (`statusBarColor` already exists for the PWA's `theme-color`), and the disguise colours while Eep is on.
- **Safe areas:** the layout already uses `env(safe-area-inset-*)`; check under the notch and the home indicator.
- **Links:** links in messages open in Safari through `@capacitor/browser`, not inside the app.
- **Photos:** `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` in `Info.plist`, so avatars, banners and Add emoji can pick photos and take pictures. The texts are neutral ("XIV uses your photos for profile pictures and emoji.").
- **Downloads:** the viewer's Download link is desktop-only already; nothing changes on phones.

### 6. Notifications section

With no push, the Settings "Notifications" section (which says "Notifications come with the iPhone app") is removed, on phones and on desktop.

## Data flow

No database changes. Supabase auth stays in the web view's `localStorage`, which the app keeps between launches. Realtime and the REST API are unchanged. The only new traffic is the update check to the app's own server.

## Error handling

- **Update check or download fails:** keep the current bundle and try again on the next resume. Never block the UI.
- **A bad bundle:** automatic rollback via `notifyAppReady`/`appReadyTimeout`; the failed bundle is deleted.
- **Bundle too new for the shell:** `minNative` makes the app skip it.
- **Privacy plugin unavailable** (for example in the browser): `isNativeApp()` guards it; the web behaviour is unchanged.
- **Photo or camera permission denied:** the file picker reports nothing chosen and the existing UI stays as it is.

## Testing

- **Unit (Vitest):** `platform.ts`, `useAppLifecycle` (mocked `@capacitor/app`), the update checker (version comparison, `minNative`, checksum and network failures, applies with `next()` only), and the build script's manifest output.
- **Website e2e (Playwright):** unchanged, and must stay green; the native code paths are off in the browser.
- **Native build check:** `npm run build:native && npx cap sync ios` and an `xcodebuild` simulator build run locally (not in CI: Xcode and, later, signing).
- **Simulator checks** (recorded in `docs/testing/iphone-checklist.md`): the switcher card shows the FF14 picker; cold start shows the disguise; resume reconnects (send from the other user while backgrounded); keyboard and composer; photo picking; a live update applied after backgrounding; a broken bundle rolls back.
- **On-device checks after enrolment:** the same list on both iPhones through TestFlight.

## Concerns checklist

| Concern | Applies | Notes |
|---|---|---|
| Error handling | Yes | Above |
| Security | Yes | Updates only from the app's own HTTPS origin, checksum-verified: the same trust as the website today. No Capgo telemetry. No new secrets in the app (the anon key is public by design). `lock_pin` rules unchanged |
| Privacy / disguise | Yes | Native switcher cover, disguise launch screen, neutral permission texts, display name "XIV" |
| Test strategy | Yes | Above |
| Database / migrations | No | No schema changes |
| Performance | Minor | The app loads its bundle locally (faster than the PWA on a bad connection). Update zips are about 1 MB |
| Accessibility | No change | Same web UI |

## Out of scope

- **Waiting on enrolment:** signing, the App Store Connect record, the TestFlight upload and inviting the partner. These are written as a runbook (`docs/ios/testflight-runbook.md`) for the owner to follow.
- **Push notifications:** not wanted.
- **Android.**
- **CI builds of the iOS app:** they need a macOS runner and signing secrets. Possible later.
