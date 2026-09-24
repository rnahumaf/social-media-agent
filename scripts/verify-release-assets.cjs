const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const packageJson = require("../package.json");
const packageLock = require("../package-lock.json");

const version = packageJson.version;
if (
  !/^\d+\.\d+\.\d+-beta\.\d+$/.test(version) ||
  packageLock.version !== version ||
  packageLock.packages?.[""]?.version !== version
)
  throw Error(
    "A versão beta deve coincidir em package.json e package-lock.json.",
  );

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyReleaseAssets(directory) {
  const rawWindows = `Social Media Agent ${version}.exe`;
  const windows = `Social.Media.Agent.${version}.exe`;
  const rawArm = `Social Media Agent-${version}-arm64-mac.zip`;
  const arm = `Social.Media.Agent-${version}-arm64-mac.zip`;
  const rawIntel = `Social Media Agent-${version}-mac.zip`;
  const intel = `Social.Media.Agent-${version}-mac.zip`;
  const entries = fs.readdirSync(directory);
  const packages = [
    [rawWindows, windows],
    [rawArm, arm],
    [rawIntel, intel],
  ];
  const expected = packages.map(([raw, canonical]) =>
    entries.includes(raw) ? raw : canonical,
  );
  const actual = entries.filter((name) => name !== "SHA256SUMS.txt");
  if (
    actual.length !== expected.length ||
    expected.some((name) => !actual.includes(name))
  )
    throw Error(
      `Pacotes inesperados para ${version}: ${actual.sort().join(", ") || "nenhum"}.`,
    );

  for (const name of expected) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size < 1_000_000)
      throw Error(`Pacote ausente ou incompleto: ${name}.`);
    const fd = fs.openSync(file, "r");
    const signature = Buffer.alloc(2);
    try {
      fs.readSync(fd, signature, 0, 2, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (signature.toString("ascii") !== (name.endsWith(".exe") ? "MZ" : "PK"))
      throw Error(`Formato inesperado do pacote: ${name}.`);
  }

  for (const [index, [, canonical]] of packages.entries())
    if (expected[index] !== canonical)
      fs.renameSync(
        path.join(directory, expected[index]),
        path.join(directory, canonical),
      );
  const lines = [];
  for (const name of [windows, arm, intel])
    lines.push(`${await sha256(path.join(directory, name))}  ${name}`);
  fs.writeFileSync(
    path.join(directory, "SHA256SUMS.txt"),
    lines.join("\n") + "\n",
  );
  return { version, files: [windows, arm, intel, "SHA256SUMS.txt"] };
}

if (require.main === module)
  verifyReleaseAssets(path.resolve(process.argv[2] || "release"))
    .then(({ version, files }) =>
      console.log(`Pacotes de ${version} validados: ${files.join(", ")}.`),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });

module.exports = { verifyReleaseAssets };
