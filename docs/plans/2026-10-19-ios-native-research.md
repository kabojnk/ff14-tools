# iOS research: hiding the chat in the app switcher, and getting a native app to two iPhones

Date: 2026-10-19 · Sub-project 4 of the [rework roadmap](2026-10-18-rework-roadmap.md) · Research only, nothing here is implemented.

## Summary and recommendation

**The problem cannot be fixed reliably in a PWA.** iOS captures the app-switcher snapshot synchronously as soon as the app's native lifecycle callback returns. A home-screen web app's DOM is rendered in a separate WebKit process, and `pagehide` / `visibilitychange` reach JavaScript asynchronously. The repaint therefore often lands after the snapshot. The existing mitigation (`usePresence.ts` shows `#privacy-screen` from `index.html` through a direct DOM write on `pagehide` and `visibilitychange`) is already about as good as a web app can do. It works some of the time and cannot be made to work every time. I found nothing in iOS 18 or iOS 26 that changes this.

**Recommendation: wrap the existing web app in Capacitor 8, and deliver it to both iPhones through TestFlight internal testing.**

- **Capacitor:** the official `@capacitor/privacy-screen` plugin (v2.0.1, Feb 2026) adds a native overlay on `UIApplication.willResignActive`. A native overlay is drawn in time for the snapshot. Point the overlay at a launch-screen image of the FF14 content picker and the app switcher shows the disguise. About 95% of the codebase carries over unchanged. Estimate 2–4 days to the first installable build, plus 2–3 days if native push is wanted.
- **TestFlight internal testing:** add the partner to the owner's App Store Connect team with the low-privilege *Marketing* role. Internal builds need no Beta App Review, no UDID and no Developer Mode, and the app is never listed publicly. She installs the free TestFlight app on her iPhone and nothing at all on her Windows PC. Each build expires after 90 days, so a fresh native build has to be uploaded at least every ~80 days. Web-code changes can ship in between through a live-update channel.
- **Cost:** $99/yr Apple Developer Program. A self-hosted live-update bundle is free; Capgo Cloud is about $12–14/month if a hosted service is preferred.

**Runner-up: Capacitor plus ad hoc distribution.** Same membership. The partner sends her UDID (from the Windows *Apple Devices* app or a profile-install web page) and turns on Developer Mode, and the owner hosts the `.ipa` behind an install link on the existing nginx server. The provisioning profile lasts a year, there is no 90-day expiry and she does not join the App Store Connect team. It costs a little more setup and keeps Developer Mode switched on, which is a visible setting.

**Not recommended:**
- **React Native / Expo rewrite.** It solves the snapshot problem just as well (`expo-screen-capture` has `enableAppSwitcherProtectionAsync`), but it means rewriting about 7.5k lines of DOM/Tailwind UI. That is roughly 4–8 weeks of work for no extra privacy benefit.
- **Free-Apple-ID sideloading** (AltStore, SideStore, Sideloadly). It needs a refresh every 7 days, has no push notifications and depends on fragile tooling.
- **EU Web Distribution, Enterprise and Custom apps.** None of them are eligible here (details below).

### Decisions the user must make

1. **TestFlight internal or ad hoc.** TestFlight internal is simpler for her and needs no Developer Mode, but she joins your App Store Connect team and you rebuild every 90 days. Ad hoc lasts a year and keeps her out of your team, but needs her UDID and Developer Mode. (Recommended: TestFlight internal.)
2. **How web updates ship.** (a) Rebuild and upload for every change, (b) a self-hosted live-update zip with `@capgo/capacitor-updater` in manual mode, or (c) Capgo Cloud (paid). Not recommended: loading the live website with `server.url`. Capacitor documents it as "not intended for production use", and the app would show nothing offline.
3. **Native push notifications now or later.** If yes, the notification text must itself be disguised (for example "XIV Tools: new content available"), because lock-screen previews would otherwise leak the chat.
4. **What the switcher snapshot shows:** the FF14 picker image (best disguise) or a plain blur (simplest).
5. **Whether the PWA stays** for desktop use: Mac, and the partner's Windows PC. Recommended: yes. The native app is only for the iPhones.
6. **Whose name is on the Apple Developer account.** The account holder's legal name is attached to the team, and the partner will see it in TestFlight.

## Comparison tables

### Privacy in the app switcher

| Approach | Mechanism | Reliable? | Effort |
|---|---|---|---|
| PWA (current) | `pagehide` / `visibilitychange` → show `#privacy-screen` | **No.** Race against an out-of-process repaint; event bugs documented in WebKit | Done |
| PWA + iOS "Require Face ID" on the icon | OS-level app lock; locked apps are blurred in the switcher | **Not available.** Tested 2026-10-19: iOS does not offer it for home-screen web apps | n/a |
| Capacitor + `@capacitor/privacy-screen` | Native view added on `willResignActive` | **Yes** (Apple's documented pattern: QA1838) | Hours |
| Capacitor + small custom plugin | Same, but shows a bundled FF14-picker image | Yes | ~½ day |
| Expo + `expo-screen-capture` | `enableAppSwitcherProtectionAsync()` blur overlay | Yes | Part of a rewrite |

### Capacitor vs React Native / Expo for this codebase

| | Capacitor 8 (wrap) | React Native / Expo (rewrite) |
|---|---|---|
| Code reuse | ~95%: same React 18 + Vite + Tailwind + Zustand + supabase-js | Logic in stores and hooks partly reusable; **all UI rewritten** (DOM/Tailwind → RN views, NativeWind) |
| Effort to first iPhone build | **2–4 days** | **4–8 weeks** (~62 non-test source files, ~7.5k LOC) |
| Snapshot hiding | Official plugin, `willResignActive` overlay | `expo-screen-capture` blur overlay |
| FF14 disguise identical | Yes, it is the same web UI | Must be rebuilt by hand; risk of drift from the PWA |
| Supabase realtime | Unchanged (WebSocket in WKWebView); add reconnect on resume | supabase-js works in RN; add AppState reconnect handling |
| Push | `@capacitor/push-notifications` → APNs token; send from an Edge Function | `expo-notifications` + Expo push service, or APNs directly |
| Updates without rebuild | Capgo / Capawesome / self-hosted zip (Ionic Appflow closes to new customers; shutdown 2027-12-31) | EAS Update (free tier 1,000 MAU) |
| Needs a Mac | Yes, Xcode to build (the owner has one), or a cloud build service | No (EAS Build cloud; free tier 15 iOS builds/month) |
| Desktop / PWA | Same codebase keeps serving the PWA | The PWA stays a separate React web codebase, so there are two UIs |

### Distribution to the partner (iPhone + Windows PC)

| Option | Cost | Partner setup on Windows/iPhone | Ongoing | Updates reach her by | Push | Main risks |
|---|---|---|---|---|---|---|
| **TestFlight internal** | $99/yr | Accept the App Store Connect invite (Apple Account with 2FA), install TestFlight, tap Install. **Nothing on Windows.** | New build every ≤90 days | TestFlight auto-update + live update | Yes | Build expiry if forgotten; she is on your ASC team (Marketing role) |
| TestFlight external | $99/yr | Install TestFlight, open the invite or public link | Same 90 days; **Beta App Review** for the first build of each version | Same | Yes | Review could reject a disguised app (hidden-features rule, guideline 2.3.1); a public link can leak |
| **Ad hoc** (runner-up) | $99/yr | Send UDID (Apple Devices app on Windows, or a profile web page); enable Developer Mode; open the install link in Safari | Profile valid 12 months; new device = re-sign | New `.ipa` via link + live update | Yes | Developer Mode stays on; a 100-device cap (irrelevant here) |
| Free Apple ID sideload (AltStore Classic / Sideloadly / SideStore) | Free | Install iTunes + iCloud (non-Store versions) + AltServer/Sideloadly on Windows; Developer Mode; trust profile | **Re-sign every 7 days** (PC on same Wi-Fi, or SideStore + VPN on the phone) | She re-sideloads each new `.ipa` | **No** (free teams cannot use push) | App stops launching if a refresh is missed; 3-app limit; tooling breaks with iOS updates |
| EU Web Distribution / alt marketplace | n/a | n/a | n/a | n/a | n/a | **Not eligible** (needs an EU organisation, 2 years membership, >1M EU installs) |
| Custom apps (Apple Business Manager) / Enterprise | n/a | n/a | n/a | n/a | n/a | **Not eligible** (needs an organisation with a D-U-N-S number; Enterprise needs 100+ employees and is for employees only) |

## Details

### 1. Can a PWA hide content in the app switcher?

**Current behaviour in this repo.** `index.html` contains a hidden `#privacy-screen` div. `src/hooks/usePresence.ts` makes it visible on `pagehide` and on `visibilitychange → hidden` through a direct DOM write, deliberately without a React re-render. It also calls `setEepMode(true)`, and `uiStore.lockApp` sets the PIN lock. This is the right design for the web.

**Why it is not reliable.**
- Apple's own guidance for native apps is that the snapshot is "captured immediately upon returning from" the background callback, and that "animations will not complete before the snapshot is taken" (Apple Technical Q&A QA1838). Native code meets that deadline because it changes the view hierarchy synchronously on the main thread.
- In a home-screen web app, the page runs in WebKit's separate WebContent process. The lifecycle event is forwarded to JavaScript asynchronously, and the new frame has to be painted and composited back. Usually that is too late for the snapshot. There is no API for a web page to delay the snapshot.
- WebKit has a long history of standalone-mode visibility bugs: events not firing at all, firing with the wrong state, or not firing on the app-switcher gesture (WebKit bugs 180523, 202399, 205942).

**iOS 18 / 26 changes.**
- iOS 26 makes every site added to the Home Screen open as a web app by default (heise, Sept 2025). That changes how apps are installed, not when the snapshot is taken.
- Web push has worked for installed web apps since iOS 16.4. Nothing in iOS 18 or 26 adds a web-facing "secure content" or snapshot API.
- `prefers-reduced-transparency` and Screen Time do not affect the snapshot.

**Best PWA-only mitigations,** in order of value. None is a guarantee.
1. Keep the current direct-DOM privacy screen and lock-on-hide (already done).
2. **Test the OS app lock.** Long-press the home-screen icon. If "Require Face ID" is offered for the web app, turn it on: iOS blurs locked apps in the switcher. Apple's support page lists only built-in apps that cannot be locked and does not mention web apps, so this needs a 2-minute test on each phone. It is a per-device user setting, and it shows a Face ID prompt on every launch, which could itself draw attention.
3. Lower what is on screen while backgrounded: auto-lock after a short idle period, and an in-app "panic" gesture that switches to the disguise before leaving the app.

**Reliability verdict:** best effort only. Treat the PWA as "usually hides it" and the native wrapper as "always hides it".

### 2. Capacitor vs React Native / Expo

#### Capacitor (recommended)

- **What changes in the repo.**
  - Add `@capacitor/core`, `@capacitor/cli` and `@capacitor/ios` (latest `@capacitor/core` 8.5.3, 2026-10-07), set `webDir: 'dist'`, and run `npx cap add ios`. That produces an `ios/` Xcode project.
  - Build with `vite build` and run `npx cap sync`.
  - Auth is email and password (`signInWithPassword`), so no deep-link or OAuth redirect work is needed.
  - Edge Functions already send `Access-Control-Allow-Origin: *`, so the `capacitor://localhost` origin works.
- **PWA service worker.** WKWebView in Capacitor does not use the vite-plugin-pwa service worker in a useful way. Disable `VitePWA` (or its registration) for the native build, for example behind a `--mode native` flag, and keep it for the web build.
- **Hiding the snapshot.**
  - `npm i @capacitor/privacy-screen`, then call `PrivacyScreen.enable({ ios: { blurEffect: 'none' } })` at startup.
  - The iOS source (ionic-team/capacitor-privacy-screen, `PrivacyScreenPlugin.swift`) observes `UIApplication.willResignActive` and adds either a `UIVisualEffectView` blur or a view built from the launch screen. It removes the view on `didBecomeActive`.
  - `willResignActive` fires earlier than `didEnterBackground`, so it also covers the swipe-up switcher gesture, Control Center and incoming calls.
  - **To keep the disguise identical,** make the iOS launch screen (LaunchScreen.storyboard / image) a screenshot of the FF14 "Random Content Picker" screen. Alternatively, write a ~40-line custom Swift plugin that shows a bundled `eep-snapshot.png`.
  - Keep the existing JS lock-on-hide so the app is PIN-locked when it comes back.
  - The older `@capacitor-community/privacy-screen` (v8.0.0, Apr 2026) is in maintenance mode; its README points to the official plugin.
- **Supabase realtime.** It works unchanged in WKWebView. iOS suspends the WebView in the background, so the socket drops. Add a resume handler (`@capacitor/app` `appStateChange`) to re-subscribe and refetch. Supabase documents silent disconnections in backgrounded apps. `usePresence` already does restore on `pageshow`; mirror that for the native resume event.
- **Push.**
  - `@capacitor/push-notifications` returns an APNs device token on iOS. Store it in a new `device_tokens` table, and send from a Supabase Edge Function or database webhook with an APNs `.p8` key over HTTP/2. Firebase is optional.
  - Push needs a paid developer team, and TestFlight and ad hoc builds use the production APNs environment.
  - The payload text must stay inside the disguise.
- **Updates.**
  - A native rebuild is required for native or plugin changes, and at least every 90 days with TestFlight.
  - For web-only changes, use `@capgo/capacitor-updater` (v8.53.0, 2026-10-14; open source). It can run in self-hosted "manual" mode, downloading a zip of `dist/` from the owner's nginx. Capgo Cloud costs about $12–14/month, and Capawesome is from about $9/month.
  - Ionic Appflow live updates are closed to new customers and shut down 2027-12-31.
  - Apple's rules: guideline 2.5.2 bans downloaded code that changes functionality, but the Developer Program License Agreement §3.3 allows interpreted code (JS) as long as it does not change the app's primary purpose, add a storefront, or bypass security. This matters most for App Store review. Internal TestFlight and ad hoc builds get no human review, but the licence terms still apply.
- **Tooling.** iOS builds need Xcode on the owner's Mac. Xcode Cloud (included with the membership) or Capgo build can automate the 90-day rebuild.
- **Effort.** 2–4 days to a TestFlight build: Capacitor setup, service-worker split, privacy screen with FF14 launch image, safe-area and keyboard polish, icon, resume/reconnect, first upload. Add 2–3 days for push and 1 day for live updates.

#### React Native / Expo (rewrite)

- **Snapshot hiding:** `expo-screen-capture` `enableAppSwitcherProtectionAsync(blurIntensity)` blurs the app in the switcher, the background and interruptions. A custom image overlay needs a small config plugin or native module.
- **Reuse:** the Zustand stores and the supabase-js calls port. Every component does not: the chat list, composer, PIN pad, Eep picker, media gallery, GIF picker, uploads and theming are DOM + Tailwind. The disguise would have to be re-created and kept in sync with the web version.
- **Pros:**
  - No Mac needed (EAS Build cloud; free plan 15 iOS builds/month).
  - First-class EAS internal distribution: `eas device:create` gives the partner a URL/QR to register her UDID from the iPhone.
  - EAS Update OTA, free up to 1,000 MAU.
  - Smoother native feel.
- **Cons:** 4–8 weeks of work, two UIs to maintain (the PWA stays for desktop), and the same privacy result Capacitor gets in a few hours.
- **Middle path** (Expo shell with `react-native-webview` loading the bundled web app): this is Capacitor with more glue, so there is no reason to prefer it.

### 3. Distribution to the partner without the public App Store

#### (a) Ad hoc with a registered UDID ($99/yr)

- **Finding her UDID on Windows:** install Apple's *Apple Devices* app from the Microsoft Store, connect the iPhone by USB, tap Trust, select the phone, and click the info line under the device name until it shows **UDID**. Copy it. On the phone itself, a profile-install site gives the UDID with no PC.
- **Owner steps:**
  - Register the UDID in the developer portal. New memberships can take 24–72 hours to process a new device.
  - Create an ad hoc profile, archive in Xcode, then Distribute → Ad Hoc with a manifest.
  - Host the `.ipa` and `manifest.plist` over HTTPS on the existing nginx, and send an `itms-services://` link.
- **Her steps:** turn on Settings → Privacy & Security → **Developer Mode** (iOS 16+ requires it for ad hoc builds; the phone restarts), then open the link in Safari.
- **Maintenance:** the profile and the distribution certificate last 12 months, so re-sign and re-send yearly. A new phone means a new UDID and a re-sign.
- **Risks:** Developer Mode stays enabled and visible in Settings. Disabled devices still count toward the 100-device annual limit.

#### (b) TestFlight (recommended)

- **No public listing is required:** "your app does not need to be on the App Store" (App Store Connect Help). You need an App Store Connect app record. The record's name must be unique, but the home-screen display name (`CFBundleDisplayName`) can stay "XIV".
- **Internal testers:**
  - Up to 100 App Store Connect users with the Account Holder, Admin, App Manager, Developer or **Marketing** role.
  - **No Beta App Review.**
  - Builds are available for 90 days.
  - Invite her with the Marketing role (least privilege available). She signs in with her own Apple Account, installs TestFlight and installs the build. No Developer Mode, no UDID, nothing on Windows.
- **External testers:** up to 10,000 by email or public link. The first build of each version needs Beta App Review. A disguised app with an undocumented hidden chat could be rejected under guideline 2.3.1 (hidden features), so avoid this route.
- **Maintenance:**
  - Upload a new build before day 90; set a calendar reminder or a scheduled Xcode Cloud workflow.
  - TestFlight can auto-update the app on her phone.
  - Live updates cover web changes between builds.
- **Risks:** a lapsed membership or expired build stops the app launching. She can see your team in App Store Connect (read-mostly with the Marketing role).

#### (c) Free Apple ID sideloading from Windows

- **AltStore Classic:**
  - On Windows, install iTunes and iCloud from Apple (not the Microsoft Store versions) and AltServer (run as administrator), enable Wi-Fi sync, install AltStore with her Apple ID, trust the profile and enable Developer Mode.
  - Limits are three active apps and 10 App IDs per 7 days.
  - Apps must be refreshed within 7 days, with AltServer running on the same Wi-Fi.
- **Sideloadly:** similar prerequisites. Its daemon can auto-refresh over Wi-Fi or USB while the PC is on.
- **SideStore:** refreshes on the phone with a pairing file and the LocalDevVPN app (works on iOS 26 per Mar–Jun 2026 guides), but setup is fiddly.
- **Blocking issues:**
  - Free "personal teams" cannot use Push Notifications.
  - If a refresh is missed, the app will not open until it is refreshed again.
  - The owner would need to send her each new `.ipa`.
- **Verdict:** only as an emergency fallback.

#### (d) EU alternative distribution

Web Distribution requires an organisation registered in the EU, two continuous years of membership and more than 1M first annual EU installs in the prior year. Alternative marketplaces still require notarization and an app-marketplace listing, which is effectively public. Not relevant here.

#### (e) Custom apps / Enterprise

- **Custom apps and unlisted distribution:** both need an organisation in Apple Business Manager (D-U-N-S number). Unlisted apps go through full App Store review, where a disguised app risks rejection.
- **Enterprise:** needs a legal entity with 100+ employees, is for employees only and costs $299/yr.

Neither fits two private individuals.

### 4. Rollout plan (Capacitor + TestFlight internal)

| Step | Who | Effort |
|---|---|---|
| 1. ~~Quick test: "Require Face ID" for the home-screen web app~~ Done: not offered | n/a | n/a |
| 2. Enrol in the Apple Developer Program (individual) | Owner | ~1 hour + up to 48 h approval |
| 3. Add Capacitor 8 + iOS platform; split the native build from the PWA service worker | Owner | ½–1 day |
| 4. Privacy screen: `@capacitor/privacy-screen` + FF14-picker launch image; keep JS lock-on-hide; test switcher, Control Center and incoming calls | Owner | ½ day |
| 5. Resume handling: re-subscribe realtime + presence on `appStateChange` | Owner | ½ day |
| 6. Polish: safe areas, keyboard, status bar, icon, display name "XIV" | Owner | ½–1 day |
| 7. App Store Connect app record, archive and upload, add yourself as an internal tester, verify | Owner | ½ day |
| 8. Invite the partner (Marketing role) → she installs TestFlight → installs the app | Both | 15 min |
| 9. (Optional) Live updates via `@capgo/capacitor-updater` self-hosted on nginx | Owner | 1 day |
| 10. (Optional) Native push via APNs + Edge Function with disguised text | Owner | 2–3 days |
| 11. Recurring: rebuild/upload before day 90; renew the membership yearly | Owner | ~30 min per cycle |

**Total:** about 3–4 days for the core work, 6–8 days with live updates and push. Calendar time also depends on Apple's enrolment approval.

## Uncertainties

- ~~Whether iOS offers "Require Face ID" for home-screen web apps.~~ Resolved 2026-10-19: tested on the owner's iPhone. The option is not offered for home-screen web apps, so there is no free interim fix and the native wrapper is the only reliable route.
- The ad hoc + Developer Mode requirement comes from Apple forum and third-party sources (Diawi, Expo guide). Apple's own Developer Mode page names only Xcode and Apple Configurator installs.
- Live-update compliance is judged case by case by Apple. It is low risk for builds that are never publicly reviewed.

## Sources

All accessed 2026-10-19. Publication or update dates are given where the source shows one.

- Apple, Technical Q&A QA1838 "Preventing Sensitive Information From Appearing In The Task Switcher": https://developer.apple.com/library/archive/qa/qa1838/_index.html
- Apple, "Enabling Developer Mode on a device": https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device
- Apple, TestFlight overview (App Store Connect Help): https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- Apple, Add internal testers: https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers
- Apple, Device registration updates (24–72 h): https://developer.apple.com/help/account/reference/device-registration-updates/
- Apple, Getting started with Web Distribution in the EU: https://developer.apple.com/support/web-distribution-eu
- Apple, Unlisted app distribution: https://developer.apple.com/support/unlisted-app-distribution
- Apple, Developer Enterprise Program: https://developer.apple.com/programs/enterprise/
- Apple Support, Lock or hide an app on iPhone: https://support.apple.com/guide/iphone/iph00f208d05/ios
- WebKit bugs 180523, 202399 and 205942 (standalone visibility events): https://bugs.webkit.org/show_bug.cgi?id=180523 · https://bugs.webkit.org/show_bug.cgi?id=202399 · https://bugs.webkit.org/show_bug.cgi?id=205942
- heise, "iOS 26 and iPadOS 26: Changed web app behaviour on the home screen" (Sept 2025): https://heise.de/-10749652
- Galaxus, "iOS 18: locking and hiding apps, how it works" (locked apps blurred in the switcher): https://www.galaxus.de/en/page/ios-18-locking-and-hiding-apps-how-it-works-34417
- Capacitor, Privacy Screen API (v8 docs): https://capacitorjs.com/docs/apis/privacy-screen
- ionic-team/capacitor-privacy-screen source (`PrivacyScreenPlugin.swift`; npm `@capacitor/privacy-screen` 2.0.1, 2026-02-11): https://github.com/ionic-team/capacitor-privacy-screen
- capacitor-community/privacy-screen (maintenance mode; v8.0.0, 2026-04-28): https://github.com/capacitor-community/privacy-screen
- Capacitor config reference (`server.url` "not intended for use in production"): https://capacitorjs.com/docs/config
- Capgo, Migrate from Appflow (Appflow shutdown 2027-12-31): https://capgo.app/docs/upgrade/from-appflow-to-capgo/
- Capgo, Best live update tools for Capacitor apps (pricing): https://capgo.app/blog/best-live-update-tools-for-capacitor-apps/
- Capgo, Live updates and Apple compliance: https://capgo.app/blog/capacitor-live-updates-staying-compliant-with-apple/
- Bitrise, "What App Stores allow with OTA updates" (guideline 2.5.2 / DPLA §3.3): https://bitrise.io/blog/post/what-app-stores-allow-with-ota-updates-apple-and-google-policy-explained
- Capawesome, The push notifications guide for Capacitor: https://capawesome.io/blog/the-push-notifications-guide-for-capacitor
- Expo, Internal distribution: https://docs.expo.dev/build/internal-distribution/
- Expo, Internal distribution builds tutorial (`eas device:create`, enterprise $299): https://docs.expo.dev/tutorial/eas/internal-distribution-builds/
- Expo, App credentials (profiles expire after 12 months): https://docs.expo.dev/app-signing/app-credentials/
- Expo, iOS Developer Mode guide: https://docs.expo.dev/guides/ios-developer-mode/
- Expo, ScreenCapture (`enableAppSwitcherProtectionAsync`): https://docs.expo.dev/versions/latest/sdk/screen-capture/
- Expo pricing: https://expo.dev/pricing
- Diawi, "Developer Mode required in iOS/iPadOS 16" (2022-10-25): https://blog.diawi.com/2022/10/25/developer-mode-required-in-ios-ipados-16
- Supabase, Realtime: handling silent disconnections in background applications: https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
- AltStore FAQ, How to install (Windows): https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows
- AltStore FAQ, Troubleshooting (3 active apps, 10 App IDs / 7 days): https://faq.altstore.io/altstore-classic/troubleshooting-guide
- iDownloadBlog, Sideloadly v0.40 automatic refreshing (2023-02-21): https://www.idownloadblog.com/2023/02/21/sideloady-v0-40-0-update/
- iPhoneSoft, "Guide iOS 26 : installer SideStore et LiveContainer" (2026-03-11): https://iphonesoft.fr/2026/03/11/guide-ios-26-installer-sidestore-livecontainer-sideloader-apps-jailbreak
- Flavio Copes, "Should you pay for the Apple Developer Program?" (free teams: no push): https://flaviocopes.com/apple-developer-free-vs-paid
- Finding a UDID on Windows with the Apple Devices app: https://www.igeeksblog.com/how-to-find-iphone-udid-number/
- npm registry (versions and dates checked 2026-10-19): `@capacitor/core` 8.5.3 (2026-10-07), `@capgo/capacitor-updater` 8.53.0 (2026-10-14), `expo` 58.0.16 (2026-10-19)
