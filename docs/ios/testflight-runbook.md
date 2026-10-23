# iOS app: TestFlight runbook

The iOS app ("XIV") is the web app wrapped in Capacitor 8, installed on the two iPhones through TestFlight internal testing. Web changes reach it through the normal Docker deploy (live updates, see [DEPLOY.md](../../DEPLOY.md)); a new TestFlight build is only needed for native changes and every ~80 days. Local building and the simulator: [SETUP.md](../../SETUP.md#ios-app-local).

Design: [2026-10-20-ios-app-design.md](../plans/2026-10-20-ios-app-design.md).

## 1. Enrol

1. Join the Apple Developer Program at <https://developer.apple.com/programs/enroll/> as an **individual**. The legal name on the account shows as the team (the "developer") in TestFlight, to both testers.
2. When enrolment is approved, open <https://developer.apple.com/account> → Membership details and note the **Team ID**.
3. In Xcode → Settings → Accounts, add the Apple ID.

## 2. Bundle identifier

1. Pick a bundle identifier, for example the reverse-DNS of a domain you own (`com.example.xiv`). It can't be changed after the first upload.
2. Set it as `appId` in `capacitor.config.ts` (it is the placeholder `tools.xiv.app` until now).
3. Run `npx cap sync ios`.
4. Open `ios/App/App.xcodeproj` in Xcode → the **App** target → Signing & Capabilities:
   - tick **Automatically manage signing**
   - Team: your team from step 1
   - check that **Bundle Identifier** matches `appId`; if not, set it here too
5. Commit `capacitor.config.ts` and `ios/App/App.xcodeproj/project.pbxproj`.

## 3. App Store Connect record

1. <https://appstoreconnect.apple.com> → Apps → **+** → New App.
2. Platform iOS; Name **XIV** (if taken, another neutral name; it is only shown in TestFlight); Primary language English; Bundle ID from step 2; SKU any unique string (e.g. `xiv-1`); User Access: Full Access.
3. No store listing, screenshots or review are needed for internal testing.

## 4. Production web bundle in the app

The app ships a copy of the web code, so it opens offline. Build that copy against production:

1. Delete or rename any local-testing `.env.native.local`.
2. Create `.env.native.local` with the production values (the same ones the Docker build gets):
   ```env
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   VITE_BUNNY_CDN_URL=https://<pullzone>.b-cdn.net
   VITE_NATIVE_UPDATE_URL=https://<the website's origin>
   ```
3. Run `npm run ios:sync`.

`.env.native.local` is git-ignored (`.env.*.local`). The anon key is public by design; nothing secret goes into the app.

## 5. Archive and upload

1. In Xcode → App target → General → Identity:
   - **Build** (`CURRENT_PROJECT_VERSION`): raise it by one for **every** upload.
   - **Version** (`MARKETING_VERSION`, now `1.0.0`): raise it only for a new native shell (see step 9).
2. Choose the destination **Any iOS Device (arm64)**.
3. Product → **Archive**. When the Organizer opens: **Distribute App** → **App Store Connect** → **Upload**, keeping the defaults.
4. Wait for the "processing complete" email (5–30 minutes). Export compliance is answered by `ITSAppUsesNonExemptEncryption = NO` in Info.plist, so the build becomes available without questions.
5. Commit the version and build number change.

## 6. Internal testers

1. App Store Connect → **Users and Access** → **+**: invite the partner by email, role **Developer** or **Marketing** (internal testers must be team users). They accept the email invite.
2. App Store Connect → the app → **TestFlight** → Internal Testing → **+** → a group (e.g. "Us"), add both people, and tick automatic distribution so new builds reach them.
3. Both people install **TestFlight** from the App Store, open the invite email on the iPhone and install XIV.
4. On each iPhone, run the "Native app" rows of [the iPhone checklist](../testing/iphone-checklist.md).

## 7. Undoing a bad web release: roll forward

The app only installs a web bundle **newer** than the one it runs. Redeploying an old Docker image does nothing for the phones. Instead:

1. `git revert` the bad change (or fix it).
2. Deploy a new image as usual. It gets a new stamp, and the phones pick it up on their next resume and apply it the next time the app goes to the background.

A bundle that doesn't render at all is rolled back on the phone by itself after 10 s, and never downloaded again.

## 8. Every ~80 days

TestFlight builds expire 90 days after upload, and an expired build won't open. Upload a new build (step 5, build number +1) at least every ~80 days, even if only web code changed. App Store Connect → TestFlight shows each build's expiry date.

## 9. When a web change needs a new plugin or native code

A web bundle that calls a plugin the installed app doesn't have would break. `minNative` in `native-shell.json` prevents that:

1. Add the plugin (`npm install --save-exact …`, `npx cap sync ios`).
2. Raise `MARKETING_VERSION` (e.g. to `1.1.0`), then archive and upload that shell (step 5).
3. Once **both** phones have installed it from TestFlight, raise `minNative` in `native-shell.json` to the same version, and deploy.
4. Shells older than `minNative` skip the new bundles (the check returns `too-new`) and keep running the last one they could.

## 10. Checking that an update arrived

- Settings → About → **Version** is the package version; **Built** is the build date of the running web bundle.
- The running bundle's exact version (`<package version>-<UTC stamp>`) and each check's result are logged: connect the iPhone to the Mac, enable Settings → Apps → Safari → Advanced → **Web Inspector** on the iPhone, then on the Mac open Safari → Develop → the iPhone → XIV, and look for `[updates] running 0.1.0-20261021…: up-to-date` (or `queued`, `too-new`, `failed-before`, `error`).
