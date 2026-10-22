#!/usr/bin/env bash
# Builds the iOS app and runs it in the simulator. Usage: npm run ios:sim [-- "<simulator name>"]
# The web bundle uses .env + .env.native(.local); for local testing, put the .env.test values (local
# Supabase) and VITE_NATIVE_UPDATE_URL=http://localhost:8080 in .env.native.local.
set -euo pipefail
DEVICE="${1:-iPhone 16 Pro}"
APP_ID=$(grep -o "appId: '[^']*'" capacitor.config.ts | cut -d"'" -f2)

npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build | tail -3
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator
xcrun simctl install "$DEVICE" ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$DEVICE" "$APP_ID"
