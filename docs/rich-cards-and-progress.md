# Texto rico nos cards e timeline

O título e o corpo aceitam negrito, itálico, sublinhado, parágrafos, quebras de linha, listas com marcadores ou números e recuo. O editor oferece esses controles, além de desfazer/refazer; a legenda continua como texto simples. A prévia desktop, a exportação e a publicação usam o mesmo renderer JPEG de 1080 × 1350.

## Contrato do agente

Cada card mantém `title` e `body` e pode fornecer `titleRich` e `bodyRich` como documentos JSON, ou `null` para texto simples. Os campos novos são opcionais na leitura de dados antigos e obrigatórios, admitindo `null`, no JSON Schema enviado ao provedor. Exemplo:

```json
{
  "title": "Uma ideia por card",
  "body": "Primeiro item.\nSegundo item.",
  "titleRich": null,
  "bodyRich": {
    "type": "doc",
    "content": [{
      "type": "bulletList",
      "content": [
        {"type":"listItem","content":[{"type":"paragraph","attrs":{"indent":0},"content":[{"type":"text","text":"Primeiro item.","marks":[{"type":"bold"}]}]}]},
        {"type":"listItem","content":[{"type":"paragraph","attrs":{"indent":0},"content":[{"type":"text","text":"Segundo item.","marks":[{"type":"italic"},{"type":"underline"}]}]}]}
      ]
    }]
  }
}
```

- Marcas: `bold`, `italic`, `underline`. Texto sem marcas usa `marks: []`.
- Parágrafos usam `attrs.indent` de 0 a 3; `hardBreak` cria uma quebra dentro do parágrafo.
- `orderedList` recebe `attrs.start` de 1 a 99. Listas podem ter três níveis adicionais de recuo.
- Cada `listItem` começa com um parágrafo e pode conter parágrafos adicionais ou listas aninhadas.
- O texto simples deve ser igual ao documento, unindo parágrafos e itens por `\n`, sem adicionar os números ou marcadores. Os limites de 90/420 caracteres incluem essas quebras, mas não a estrutura JSON.
- O título simples aparece em negrito; no documento rico, as marcas definem quais trechos têm negrito.
- HTML, links e nós executáveis não fazem parte do contrato. Texto literal é escapado antes de entrar no SVG.

A geração, o contexto anterior e a proposta de reescrita preservam a formatação. A correção local não achata documentos ricos para contornar uma resposta inválida; quando não consegue conservar o conteúdo, o fluxo mantém a resposta no histórico para correção. Alterações de formatação durante uma reescrita impedem aplicar a proposta sobre o conteúdo alterado. Salvar uma nova revisão invalida a aprovação anterior, inclusive quando só a formatação mudou.

## Progresso da geração

A timeline segue `session.cursor`, `status`, `mode` e `channels`. O modo de pesquisa passa por pesquisa, evidências, canais escolhidos e revisão. O modo de adaptação omite pesquisa e evidências. A etapa ativa tem indicador animado e identificação acessível; etapas concluídas recebem uma marca de conclusão. Pausa, interrupção e cancelamento conservam o progresso e param a animação. Movimento reduzido desativa animações e transições. A contagem representa etapas concluídas, sem estimativa de tempo restante.

## Verificação

```sh
npm test
npm run build
npm run test:rich-text-desktop
npm run test:timeline-desktop
npm run test:editorial-desktop
```

Os testes do núcleo cobrem contrato, texto visível, escape, quebra de linhas, alinhamento de listas, overflow, equivalência entre prévia/JPEG, cache, rascunhos, histórico portável, aprovação e contexto do agente. Os testes desktop usam Electron e IPC reais com dados descartáveis, verificando controles, colagem, limites, autosave, reabertura, duplicação, reordenação e concorrência com reescritas. A timeline acompanha transições reais do pipeline com provedores simulados, incluindo falha, retomada, conclusão, adaptação por canal e cancelamento.

O aceite visual compara janelas de 1440 × 940 e 780 × 640, também com zoom de 125%. As chamadas de IA e os serviços externos são simulados; esses testes não publicam em contas externas. Para capturas opcionais apenas das fixtures, defina `STUDIO_CAPTURE_DIR` para uma pasta ignorada pelo Git.
