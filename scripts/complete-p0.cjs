// Branch-only completion transformations; removed before merging.
const fs = require("node:fs");
function edit(file, old, next) {
  const text = fs.readFileSync(file, "utf8");
  if (text.split(old).length !== 2) throw Error("Missing completion anchor: " + file + " " + old.slice(0, 90));
  fs.writeFileSync(file, text.replace(old, next));
}
edit("core/reconcile.cjs", 'async function reconcile(w, { id, channel = "wordpress", remoteId = "" }, service)',
  'async function reconcile(w, { id, channel = "wordpress", remoteId = "", resolution = "check", confirmed = false }, service)');
edit("core/reconcile.cjs", '  if (channel === "instagram") {', `  if (resolution === "not-published") {
    if (confirmed !== true) throw Error("Confirme que você conferiu o destino e não encontrou o envio desta tentativa.");
    (p.publicationHistory ||= []).push({ channel, ...structuredClone(previous) });
    return commit({ status: "failed", manualCheck: { resolution, at: now() },
      recoveryNote: "Você registrou que o envio desta tentativa não apareceu no destino. Esta é uma conferência manual, não uma confirmação da API. O histórico foi preservado e nenhum conteúdo foi reenviado. Uma nova tentativa exige clicar em publicar." });
  }
  if (resolution !== "check") throw Error("Tipo de conferência inválido.");
  if (channel === "instagram") {`);
edit("src/PublishDestinations.tsx", 'function Destination({ channel, ...props }', `function ManualRecovery({ id, channel, disabled, act }: { id: string; channel: string; disabled: boolean; act: Props["act"] }) {
  const [confirmed, setConfirmed] = useState(false);
  return <details className="manual-recovery">
    <summary>O envio não apareceu no destino</summary>
    <p className="small muted">Confira a conta e a tentativa indicadas acima. Registrar esta conferência apenas libera uma nova tentativa; não publica nem remove conteúdo.</p>
    <label className="check"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />Conferi o destino e o envio desta tentativa não foi publicado.</label>
    <button disabled={disabled || !confirmed} onClick={() => act("reconcile", { id, channel, resolution: "not-published", confirmed: true })}>Registrar conferência manual</button>
  </details>;
}
function Destination({ channel, ...props }`);
edit("src/PublishDestinations.tsx", '            <form onSubmit={async e => {', '            <><form onSubmit={async e => {');
edit("src/PublishDestinations.tsx", '            </form>}', '            </form><ManualRecovery id={p.id} channel={channel} disabled={!view.canCheck} act={act} /></>}');
edit("core/instagram-auth.cjs", 'async function profile(token, version = "v23.0")', 'async function profile(token, version = "v23.0", signal)');
edit("core/instagram-auth.cjs", '    { headers: { Authorization: `Bearer ${token}` } },', '    { headers: { Authorization: `Bearer ${token}` }, signal },');
edit("core/instagram-auth.cjs", '            result.siteUrl,\n          );', '            result.siteUrl,\n            signal,\n          );\n          signal?.throwIfAborted();');
edit("core/instagram-auth.cjs", '        const account = await profile(result.token);', '        const account = await profile(result.token, "v23.0", signal);\n        signal?.throwIfAborted();');
edit("core/instagram-auth.cjs", '      method: "DELETE",\n      headers: { Authorization: `Bearer ${verifier}` },', '      method: "DELETE",\n      headers: { Authorization: `Bearer ${verifier}` },\n      signal: AbortSignal.timeout(3000),');
edit("core/wordpress-auth.cjs", 'async function profile(token, siteId, siteUrl)', 'async function profile(token, siteId, siteUrl, signal)');
edit("core/wordpress-auth.cjs", '      new URLSearchParams({ client_id: clientId, token }),', '      new URLSearchParams({ client_id: clientId, token }),\n    { signal },');
edit("core/wordpress-auth.cjs", '    { headers: { Authorization: `Bearer ${token}` } },', '    { headers: { Authorization: `Bearer ${token}` }, signal },');
edit("core/blogger.cjs", 'async function blogs(token)', 'async function blogs(token, signal)');
edit("core/blogger.cjs", '    { headers: { Authorization: "Bearer " + token } },', '    { headers: { Authorization: "Bearer " + token }, signal },');
edit("electron/main.cjs", '    const blogs = await blogger.blogs(credential.token);', '    const blogs = await blogger.blogs(credential.token, operations.signal);');
edit("electron/main.cjs", '    w.storeSecret("wordpressCom", site.token);', '    operations.signal?.throwIfAborted();\n    w.storeSecret("wordpressCom", site.token);');
edit("electron/main.cjs", '    w.storeSecret("instagram", account.token);', '    operations.signal?.throwIfAborted();\n    w.storeSecret("instagram", account.token);');
edit("electron/main.cjs", '      buttons: ["Cancelar", "Publicar agora"],', '      buttons: ["Cancelar", p.publications[channel]?.remoteId && channel !== "instagram" ? "Atualizar agora" : "Publicar agora"],');
fs.appendFileSync("tests/p0-flow.test.cjs", `
test("P0 manual absence confirmation preserves the attempt and never calls publishing APIs", async t => {
  const { w, p } = await fixture(t);
  p.publications.wordpress = { status: "uncertain", revision: current(p).id, remoteId: "77", destination: w.state.settings.wordpressUrl };
  mockRequest(t, async () => { throw Error("Manual confirmation must not call a remote API"); });
  await assert.rejects(reconcile(w, { id: p.id, resolution: "not-published" }), /Confirme/);
  assert.equal(p.publications.wordpress.status, "uncertain");
  await reconcile(w, { id: p.id, resolution: "not-published", confirmed: true });
  assert.equal(p.publications.wordpress.status, "failed");
  assert.equal(p.publications.wordpress.remoteId, "77");
  assert.equal(p.publicationHistory.at(-1).status, "uncertain");
  assert.equal(p.publications.wordpress.manualCheck.resolution, "not-published");
});
test("P0 connection verification forwards cancellation to every provider", async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = (url, options) => new Promise((resolve, reject) => {
    assert.ok(options.signal);
    if (options.signal.aborted) reject(options.signal.reason);
    else options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  const controller = new AbortController();
  const pending = [
    require("../core/instagram-auth.cjs").profile("fixture", "v23.0", controller.signal),
    require("../core/wordpress-auth.cjs").profile("fixture", "123", "https://example.test", controller.signal),
    blogger.blogs("fixture", controller.signal),
  ];
  controller.abort(Error("Cancelled fixture verification"));
  const results = await Promise.allSettled(pending);
  for (const result of results) { assert.equal(result.status, "rejected"); assert.match(result.reason.message, /Cancelled fixture/); }
});
`);
edit("tests/p0-desktop.cjs", '    const p = seed.create("Pauta P0",', `    const manual = seed.create("Conferência manual P0", "Teste", "", { channels: ["blog"], manual: true });
    seed.revise(manual.id, { article: "# Conteúdo para conferir", caption: "", cards: [] });
    manual.publications.wordpress = { status: "uncertain", revision: current(manual).id, title: manual.title, destination: "https://example.test" };
    const p = seed.create("Pauta P0",`);
edit("tests/p0-desktop.cjs", '    console.log("P0 desktop passed:', `    await evaluate("[...document.querySelectorAll('.projects button')].find(b=>b.textContent.includes('Conferência manual P0')).click()");
    await dom("document.querySelector('.project-header h1')?.textContent === 'Conferência manual P0'");
    await click("Revisar e publicar");
    await dom("!!document.querySelector('.manual-recovery')");
    assert.equal(await evaluate("document.querySelector('.manual-recovery button').disabled"), true);
    await evaluate("document.querySelector('.manual-recovery summary').click(); document.querySelector('.manual-recovery input').click()");
    await click("Registrar conferência manual");
    await dom("document.querySelector('[data-destination=wordpress]').textContent.includes('conferência manual, não uma confirmação da API')");
    const checked = (await call("state")).projects.find(item => item.id === manual.id);
    assert.equal(checked.publications.wordpress.status, "failed");
    assert.equal(checked.publicationHistory.at(-1).status, "uncertain");
    assert.equal(postCalls, 0);
    console.log("P0 desktop passed:`);
fs.appendFileSync("docs/p0-validation.md", "\nA recuperação inclui conferência manual explícita quando o usuário verifica o destino e não encontra o envio. Ela preserva a tentativa no histórico, distingue a declaração do usuário da verificação da API e não publica conteúdo. As etapas de verificação das conexões também recebem o sinal de cancelamento, com limpeza remota limitada a três segundos.\n");
console.log("P0 completion transformations applied.");
