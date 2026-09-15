# P1 — produção simples, rascunhos e reaproveitamento

## Entrega

O editor mantém apenas as abas dos canais selecionados. Fontes, conversa e histórico ficam sob demanda em Ferramentas da pauta; publicação abre a partir do editor. Configurações reúne IA, voz/aparência e destinos. Um modelo padrão preenche os quatro papéis, com personalização opcional e preservação dos modelos diferentes já configurados. Aparência do carrossel fica recolhida.

Rascunhos são gravados automaticamente em `drafts/<id>.json`, ao lado do banco do workspace. O debounce reúne digitações e a fila serializa gravações. Navegação e fechamento normal esperam a última edição; falhas mantêm o rascunho pendente e oferecem nova tentativa. A cópia portável inclui os rascunhos. O autosave não reescreve o banco inteiro nem cria uma revisão por tecla. Geração, aplicação de proposta e preparação da publicação criam pontos de revisão; Histórico também permite criar uma revisão explícita. Um rascunho incompatível com a revisão atual não é aplicado silenciosamente. Arquivos de rascunho ilegíveis são preservados e o problema é isolado à pauta.

Publicação usa uma ação de aprovar e publicar/atualizar, com confirmação do destino antes da aprovação e envio. A exportação local de rascunho não exige aprovação, não publica e identifica o material como rascunho no manifesto. Os estados e caminhos de recuperação P0 permanecem ativos.

Miniaturas e ampliação compartilham um resultado. O renderizador usa cache LRU em memória, limitado a 32 MiB/120 entradas, e deduplica renderizações simultâneas. A chave inclui o workspace e o SVG exato, com posição, estilo e imagens validadas. Uma edição em um card reaproveita os outros JPEGs; erros são mostrados apenas no card afetado. Aprovação e exportação continuam estritas e usam o mesmo renderizador.

Geração distingue pesquisa nova de adaptação do artigo salvo. Adaptar somente para Instagram executa social e revisor; não chama pesquisador, PubMed, web ou redator. Adaptar ambos os canais executa redator, social e revisor. Reescrita permanece restrita ao alvo e não pesquisa. A conversa usa o rascunho atual quando ele está salvo, sem exigir uma nova revisão.

Decisões de público, objetivo, tese e orientações são persistentes na pauta. O contexto usa perfil limitado por papel e seleção de histórico por recência/relevância; exemplos de escrita não são enviados ao pesquisador. Decisões e material principal não são cortados silenciosamente. O orçamento é uma estimativa conservadora em bytes UTF-8, não um tokenizer exato: entradas grandes demais são recusadas antes da chamada com indicação de como reduzir a tarefa. Os limites de saída variam por operação. Respostas de geração/planejamento/reescrita interrompidas por limite preservam texto e consumo sem promover conteúdo incompleto a revisão final. A retomada da geração permite limite maior, ainda limitado.

## Validação local

Executada em Linux com Node 22 e Electron 43.7.0, em workspaces descartáveis e com respostas externas controladas:

- `npm test`: 118 testes aprovados (97 existentes + 21 P1), sem falhas ou testes ignorados.
- `npm run build`: TypeScript e Vite concluídos.
- `tests/desktop-smoke.cjs`: IPC, exportação e persistência.
- `tests/editorial-desktop.cjs`: edição manual/visual/Markdown, propostas e concorrência, mídia/estilo, histórico, configurações, cópia portável e flush de fechamento.
- `tests/p0-desktop.cjs`: recuperação, estados de publicação, cancelamento, fontes e avaliações vinculadas à revisão; cobertura mantida com a nova navegação.
- `tests/p1-desktop.cjs`: navegação/reload/fechamento com autosave, modelo único, exportação sem aprovação, decisões persistentes, adaptação de duas chamadas, prévia compartilhada, erro isolado e confirmação combinada de publicação.

Capturas de fixtures conferidas em 1440×940 e 780×640; o aceite editorial inclui zoom de 125%. Os testes verificam transbordamento horizontal. Capturas e ambientes de desenvolvimento não integram o código distribuído.

A verificação remota Windows/macOS é registrada na CI da PR. Validação de núcleo, build e empacotamento no macOS não equivale a uma sessão interativa nesse sistema. Não foram feitas chamadas pagas de IA nem publicações editoriais reais.

## Escopo preservado

Não foram incluídos novos agentes, novas redes, pesquisa em arquivos fornecidos pelo usuário ou normalização completa do banco (P2). Aprovações continuam vinculadas à revisão e ao destino. A versão e os executáveis de releases anteriores não são substituídos por esta alteração.
