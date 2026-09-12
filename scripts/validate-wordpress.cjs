const { connect } = require("../core/instagram-auth.cjs");
const { origin } = require("../core/auth-config.json");
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
connect({
  service: origin,
  provider: "wordpress",
  signal: controller.signal,
  openBrowser: async (url) => {
    process.stdout.write(JSON.stringify({ authorizationUrl: url }) + "\n");
  },
})
  .then((site) => {
    if (process.argv[2] && new URL(site.siteUrl).hostname !== process.argv[2])
      throw Error("O site retornado não corresponde ao esperado.");
    process.stdout.write(
      JSON.stringify({
        connected: true,
        siteUrl: site.siteUrl,
        postsAccess: true,
        tokenPersisted: false,
      }) + "\n",
    );
  })
  .catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
