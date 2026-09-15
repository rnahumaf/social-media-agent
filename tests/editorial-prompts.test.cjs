const test = require("node:test");
const assert = require("node:assert/strict");
const {
  instructions,
  systemFor,
  chatInstruction,
  naturalWriting,
  naturalWritingSkill,
} = require("../core/editorial-prompts.cjs");

test("redator recebe por padrão um contrato completo de escrita natural", () => {
  const prompt = systemFor("writer", "Prefira exemplos veterinários.");

  assert.equal(naturalWritingSkill, "rn-natural-writing");
  assert.match(prompt, /^\[Skill editorial ativa: rn-natural-writing\]/);
  assert.match(prompt, /Identifique público, propósito, voz e extensão/);
  assert.match(prompt, /Preserve termos técnicos, fontes, números/);
  assert.match(prompt, /Defina uma tese central/);
  assert.match(prompt, /Cada parágrafo deve acrescentar evidência/);
  assert.match(prompt, /Não use travessões como recurso estilístico/);
  assert.match(prompt, /Não acrescente avisos defensivos/);
  assert.match(prompt, /não transforme associação em causalidade/);
  assert.match(prompt, /\[PMID: número\].*perto da afirmação/);
  assert.match(prompt, /link Markdown da fonte web/);
  assert.match(prompt, /Preferências editoriais deste workspace:/);
  assert.match(prompt, /Prefira exemplos veterinários\.$/);
});

test("adaptação social e revisão preservam o mesmo padrão editorial", () => {
  assert.ok(
    instructions.social.startsWith(
      naturalWriting,
    ),
  );
  assert.ok(
    instructions.reviewer.startsWith(
      naturalWriting,
    ),
  );
  assert.match(
    instructions.social,
    /Cada card deve comunicar uma ideia concreta/,
  );
  assert.match(instructions.social, /sem repetir todo o conteúdo/);
  assert.match(instructions.reviewer, /falsa ponderação/);
  assert.match(instructions.reviewer, /proponha uma redação direta/);
  assert.match(chatInstruction, /Responda à conversa com clareza/);
});

test("preferências vazias não criam uma seção de memória artificial", () => {
  assert.equal(systemFor("writer", "   "), instructions.writer);
  assert.throws(
    () => systemFor("papel-inexistente"),
    /Papel editorial desconhecido/,
  );
});
