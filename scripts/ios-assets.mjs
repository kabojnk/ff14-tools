// Regenerates the iOS app's icon and its Splash image. Splash is both the launch screen and, through
// @capacitor/privacy-screen, the app-switcher card, so it is a picture of the real FF14 picker.
// Needs the e2e stack: npm run db:start, npm run db:reset, npm run dev:test (port E2E_PORT, default 5174)
// and npx playwright test --project=setup (for e2e/.auth/alice.json). macOS only (sips).
import { devices, webkit } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const BASE = `http://localhost:${process.env.E2E_PORT ?? 5174}`
const ASSETS = 'ios/App/App/Assets.xcassets'
const ICON = `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`
const SPLASH = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((n) => `${ASSETS}/Splash.imageset/${n}`)

const browser = await webkit.launch()
try {
  // Icon: public/icon.svg at 1024 px. App Store icons may not have an alpha channel, so it goes
  // through JPEG and back to drop it.
  const iconPage = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
  const svg = readFileSync('public/icon.svg').toString('base64')
  await iconPage.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="1024" height="1024" style="display:block"></body>`)
  await iconPage.screenshot({ path: ICON })
  execFileSync('sips', ['-s', 'format', 'jpeg', ICON, '--out', `${ICON}.jpg`], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'png', `${ICON}.jpg`, '--out', ICON], { stdio: 'ignore' })
  rmSync(`${ICON}.jpg`)

  // Splash: the FF14 picker as a signed-in phone shows it in disguise, at iPhone Pro Max size (1290×2796).
  const context = await browser.newContext({
    ...devices['iPhone 15 Pro Max'],
    viewport: { width: 430, height: 932 },
    storageState: 'e2e/.auth/alice.json',
  })
  await context.addInitScript(() => sessionStorage.setItem('eepMode', 'true'))
  const page = await context.newPage()
  await page.goto(BASE)
  await page.getByRole('heading', { name: 'FF14 Random Content Running Agenda Picker' }).waitFor()
  await page.getByRole('button', { name: 'Logout' }).waitFor()
  // On the phone the header sits below the status bar (a 59 pt safe-area inset); the browser has none.
  await page.addStyleTag({ content: 'header { padding-top: 59px !important; }' })
  const png = await page.screenshot()
  for (const file of SPLASH) writeFileSync(file, png)
  console.log(`wrote ${ICON} and ${SPLASH.length} Splash images`)
} finally {
  await browser.close()
}
