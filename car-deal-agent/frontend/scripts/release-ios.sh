#!/bin/zsh
# Builds AutoHalle for the App Store and uploads it to App Store Connect.
#
# Needs a paid Apple Developer Program membership (the free "Personal Team" cannot upload) and the
# app created in App Store Connect with the bundle id io.github.mozien.autohalle.
#   TEAM_ID=XXXXXXXXXX ./scripts/release-ios.sh            archive + export an .ipa (dist-ios/)
#   TEAM_ID=XXXXXXXXXX UPLOAD=1 ./scripts/release-ios.sh   … and upload it (Xcode must be signed in
#                                                          to that Apple ID: Xcode → Settings → Accounts)
# Run from frontend/. The build number is the date and time, so every upload is higher than the last.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TEAM_ID:?set TEAM_ID to the team id of the paid developer account (developer.apple.com → Membership)}"
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
BUILD=$(date +%Y%m%d%H%M)
OUT=dist-ios
rm -rf "$OUT" && mkdir -p "$OUT"

npm ci
npm run app:build

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>${UPLOAD:+upload}${UPLOAD:-export}</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/AutoHalle.xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD" archive

xcodebuild -exportArchive -archivePath "$OUT/AutoHalle.xcarchive" -exportPath "$OUT" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates

echo "Fertig: Version $(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$OUT/AutoHalle.xcarchive/Info.plist") ($BUILD) in $OUT"
