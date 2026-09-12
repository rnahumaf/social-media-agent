// Read-only live OAuth diagnostic. Never prints or persists the access token.
const { connect } = require("../core/instagram-auth.cjs");
const { origin } = require("../core/auth-config.json");
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
connect({
  service: origin,
  signal: controller.signal,
  openBrowser: async (url) => {
    process.stdout.write(JSON.stringify({ authorizationUrl: url }) + "\n");
  },
})
  .then((account) => {
    const expected = process.argv[2]?.replace(/^@/, "");
    if (expected && account.username !== expected)
      throw Error("A conta retornada não corresponde à conta esperada.");
    process.stdout.write(
      JSON.stringify({
        connected: true,
        username: account.username,
        expiresAt: account.expiresAt,
        tokenPersisted: false,
      }) + "\n",
    );
  })
  .catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
