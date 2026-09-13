const fs = require("node:fs");
const path = require("node:path");
const { Workspace } = require("../core/workspace.cjs");

async function main() {
  const releaseRoot = path.resolve(__dirname, "..", "release");
  const destination = path.resolve(
    process.argv[2] || path.join("release", "meta-review-workspace"),
  );
  if (
    destination !== releaseRoot &&
    !destination.startsWith(releaseRoot + path.sep)
  )
    throw Error("O workspace de análise deve ficar dentro da pasta release.");
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true });
  fs.mkdirSync(destination, { recursive: true });

  const workspace = await Workspace.open(destination);
  workspace.state.name = "Meta App Review";
  workspace.state.settings.demo = false;
  const project = workspace.create(
    "Revisão humana antes de publicar",
    "Material neutro preparado para demonstrar a aprovação e a publicação de um carrossel no Instagram.",
  );
  workspace.revise(project.id, {
    article:
      "# Revisão humana antes de publicar\n\nEste material demonstra o fluxo de aprovação do Social Media Agent. O usuário confere o texto, os cards e o destino antes de autorizar uma publicação.",
    caption:
      "Publicação de teste para a análise do Social Media Agent. O conteúdo foi revisado e o destino foi confirmado antes do envio. #AppReview",
    cards: [
      {
        title: "Revisar antes de publicar",
        body: "Confira o texto, a ordem dos cards e a conta de destino antes de aprovar o carrossel.",
      },
      {
        title: "A decisão continua com você",
        body: "O Social Media Agent só publica depois da aprovação explícita do usuário para o Instagram conectado.",
      },
    ],
    sources: [],
    demo: false,
  });
  workspace.save();
  workspace.close();
  console.log(destination);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
