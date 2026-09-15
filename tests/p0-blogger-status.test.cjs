const test = require("node:test");
const assert = require("node:assert/strict");
const providers = require("../core/providers.cjs");
const blogger = require("../core/blogger.cjs");
const { reconcile } = require("../core/reconcile.cjs");

test("P0 Blogger recovery requests ADMIN view for publication status", async (t) => {
  const originalRequest = providers.request;
  const originalVerify = blogger.verify;
  t.after(() => {
    providers.request = originalRequest;
    blogger.verify = originalVerify;
  });
  const revision = { id: "r1", article: "# Tema" };
  const project = {
    title: "Tema",
    revisions: [revision],
    publications: {
      blogger: {
        status: "uncertain",
        revision: "r1",
        title: "Tema",
        destination: "123",
      },
    },
  };
  let saved = 0;
  const w = {
    secrets: {},
    state: { settings: { bloggerId: "123" } },
    project: () => project,
    save: () => saved++,
    snapshot: () => ({ project }),
  };
  const { renderBlog } = await import("../core/blog-html.mjs");
  blogger.verify = async () => ({ token: "fixture" });
  providers.request = async (url, options) => {
    assert.equal(options.method, undefined);
    const requestURL = new URL(url);
    assert.equal(requestURL.searchParams.get("view"), "ADMIN");
    assert.equal(requestURL.pathname, "/blogger/v3/blogs/123/posts/77");
    return {
      id: "77",
      blog: { id: "123" },
      status: "LIVE",
      title: "Tema",
      content: renderBlog(revision.article),
      url: "https://example.blogspot.com/post",
    };
  };
  await reconcile(w, { id: "p1", channel: "blogger", remoteId: "77" });
  assert.equal(saved, 1);
  assert.equal(project.publications.blogger.status, "reconciled");
  assert.equal(project.publications.blogger.revision, "r1");
});
