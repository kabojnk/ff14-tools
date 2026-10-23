#!/usr/bin/env bash
# Builds the iOS app and runs it in the simulator. Usage: npm run ios:sim [-- "<simulator name>"]
# The web bundle uses .env + .env.native(.local); for local testing, put the .env.test values (local
# Supabase) and VITE_NATIVE_UPDATE_URL=http://localhost:8080 in .env.native.local.
set -euo pipefail
DEVICE="${1:-iPhone 16 Pro}"
APP_ID=$(grep -o "appId: '[^']*'" capacitor.config.ts | cut -d"'" -f2)
# A name can exist once per installed iOS version; use the newest one's id.
UDID=$(xcrun simctl list devices available | awk -v name="$DEVICE" '
  /^-- iOS/ { ios = 1; next } /^--/ { ios = 0 }
  ios && index($0, "    " name " (") == 1 { match($0, /[0-9A-F-]{36}/); id = substr($0, RSTART, RLENGTH) }
  END { print id }')
[ -n "$UDID" ] || { echo "No available simulator named \"$DEVICE\"" >&2; exit 1; }

npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build | tail -3
xcrun simctl boot "$UDID" 2>/dev/null || true
open "$(xcode-select -p)/Applications/Simulator.app" || true
xcrun simctl install "$UDID" ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$UDID" "$APP_ID"
