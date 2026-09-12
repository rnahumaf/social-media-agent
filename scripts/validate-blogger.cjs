const { connect } = require("../core/instagram-auth.cjs");
const { blogs } = require("../core/blogger.cjs");
const { origin } = require("../core/auth-config.json");
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
connect({
  service: origin,
  provider: "blogger",
  signal: controller.signal,
  openBrowser: async (url) =>
    process.stdout.write(JSON.stringify({ authorizationUrl: url }) + "\n"),
})
  .then(async (credential) => {
    const available = await blogs(credential.token);
    const selected = available.find(
      (b) => new URL(b.url).hostname === process.argv[2],
    );
    if (!selected)
      throw Error("A conta Google não confirmou acesso ao blog esperado.");
    process.stdout.write(
      JSON.stringify({
        connected: true,
        blogUrl: selected.url,
        tokenPersisted: false,
        contentPublished: false,
      }) + "\n",
    );
  })
  .catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
