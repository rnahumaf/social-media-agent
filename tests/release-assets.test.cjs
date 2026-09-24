const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { version } = require("../package.json");
const { verifyReleaseAssets } = require("../scripts/verify-release-assets.cjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
  t.after(() => {
    const resolved = fs.realpathSync(dir);
    if (
      path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(resolved).startsWith("release-assets-")
    )
      throw Error("Unexpected release fixture path.");
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return dir;
}

function writePackage(dir, name, signature) {
  const bytes = Buffer.alloc(1_000_001);
  bytes.write(signature, 0, "ascii");
  fs.writeFileSync(path.join(dir, name), bytes);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("release bundle requires all three packages and records their actual hashes", async (t) => {
  const dir = fixture(t);
  const windows = `Social.Media.Agent.${version}.exe`;
  const arm = `Social.Media.Agent-${version}-arm64-mac.zip`;
  const intel = `Social.Media.Agent-${version}-mac.zip`;
  const hashes = [
    writePackage(dir, `Social Media Agent ${version}.exe`, "MZ"),
    writePackage(dir, arm, "PK"),
    writePackage(dir, intel, "PK"),
  ];

  const result = await verifyReleaseAssets(dir);

  assert.deepEqual(result.files, [windows, arm, intel, "SHA256SUMS.txt"]);
  assert.ok(fs.existsSync(path.join(dir, windows)));
  assert.equal(
    fs.readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8"),
    [windows, arm, intel]
      .map((name, index) => `${hashes[index]}  ${name}\n`)
      .join(""),
  );
  await verifyReleaseAssets(dir);
});

test("release bundle rejects missing and invalid packages before publication", async (t) => {
  const dir = fixture(t);
  writePackage(dir, `Social Media Agent ${version}.exe`, "MZ");
  writePackage(dir, `Social.Media.Agent-${version}-arm64-mac.zip`, "PK");
  await assert.rejects(verifyReleaseAssets(dir), /Pacotes inesperados/);

  writePackage(dir, `Social.Media.Agent-${version}-mac.zip`, "NO");
  await assert.rejects(verifyReleaseAssets(dir), /Formato inesperado/);
  assert.equal(fs.existsSync(path.join(dir, "SHA256SUMS.txt")), false);
});
