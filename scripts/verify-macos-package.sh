#!/bin/bash
# Read-only verification of the app, including every nested Mach-O binary.
set -euo pipefail
app_path="$1"
expected_arch="$2"
if [ "$expected_arch" = x64 ]; then expected_arch=x86_64; fi
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app_path/Contents/Info.plist")" = "12.0"
codesign --verify --deep --strict --verbose=4 "$app_path"
details="$(codesign -d --verbose=4 "$app_path" 2>&1)"
printf '%s\n' "$details"
grep -q 'Signature=adhoc' <<< "$details"
grep -q 'runtime' <<< "$details"
test -f "$app_path/Contents/_CodeSignature/CodeResources"
entitlements="$(codesign -d --entitlements :- "$app_path" 2>/dev/null)"
printf '%s\n' "$entitlements"
# Do not silently grant additional capabilities when the signing configuration changes.
printf '%s' "$entitlements" | plutil -convert json -o - - | node -e '
let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{
 const assert=require("node:assert/strict");
 assert.deepEqual(JSON.parse(s),{
  "com.apple.security.cs.allow-jit":true,
  "com.apple.security.cs.disable-library-validation":true
 });
});'
count=0
while IFS= read -r -d '' binary; do
  if file -b "$binary" | grep -q 'Mach-O'; then
    test "$(lipo -archs "$binary")" = "$expected_arch"
    codesign --verify --strict --verbose=2 "$binary"
    count=$((count + 1))
  fi
done < <(find "$app_path" -type f -print0)
test "$count" -gt 0
echo "Verified $count signed $expected_arch Mach-O binaries and the complete app seal."
# A valid ad-hoc signature is not Developer ID or notarization. Report assessment separately.
set +e
assessment="$(spctl --assess --type execute --verbose=4 "$app_path" 2>&1)"
assessment_status=$?
set -e
printf 'Gatekeeper assessment status=%s (ad-hoc, not notarized):\n%s\n' "$assessment_status" "$assessment"
