# Arquitetura da beta

O aplicativo mantém três fronteiras: React apresenta e edita; o processo principal Electron controla os comandos; `core/` guarda dados, executa o fluxo e conecta serviços. O renderer não acessa Node, filesystem nem tokens salvos. Conteúdo gerado é apresentado como texto ou imagem local.

`Workspace` é dono da persistência. O bloqueio exclusivo impede duas instâncias de abrirem a mesma pasta. Cada alteração salva o banco completo por arquivo temporário e rename. O backup ocorre sem outra mutação em andamento e pode ser aberto diretamente; não é um arquivo ZIP.

Cada projeto guarda canais selecionados, ferramentas de pesquisa permitidas, briefing, fontes, mensagens, sessões, execuções, revisões e publicação por destino. A sessão registra os canais, a revisão de partida, um cursor, artefatos parciais e eventos persistidos após cada etapa. Retomar após uma edição ou mudança de canais exige iniciar outra geração. Revisões aceitam rascunhos incompletos e guardam Markdown, legenda, cards, fontes, estilo e origem. Blog só exige artigo para aprovação; Instagram exige legenda e 2 a 10 cards válidos. SHA-256 vincula título, revisão, estilo, mídia renderizada, canais e destino à aprovação. Cada conector publica apenas seu material. IDs remotos nunca vêm da LLM.

O fluxo é sequencial e considera os canais solicitados. O redator recebe somente o artigo anterior; o social recebe o artigo ou briefing e fontes como referência. A skill de runtime `rn-natural-writing`, mantida em `core/skills/`, entra no prompt de sistema da geração, da revisão e das reescritas editoriais. Ela é empacotada com o aplicativo e não depende das skills instaladas no computador do usuário. Blog sozinho dispensa social; Instagram sozinho dispensa redator. A pesquisa escolhe uma ferramenta permitida: PubMed ou `openrouter:web_search`, com Exa e limites de chamadas, resultados e caracteres. Somente as citações URL retornadas pelo serviço viram fontes web. Elas distinguem trechos de metadados; PubMed distingue resumos de metadados. Falhas não acionam ferramentas desabilitadas nem produzem evidência fictícia. Consultas sem fontes permitem uma reformulação e depois interrompem a geração. Saídas e solicitações ficam no histórico; mensagens internas não retornam à conversa usada como contexto.

`core/editorial-model.cjs` concentra canais, pesquisa, conhecimento e estilo. `editorialVersion: 2` migra memória para preferências gerais e inicia workspaces antigos com PubMed, preservando histórico e credenciais. Workspaces novos oferecem ambas as buscas. As aprovações antigas são invalidadas; revisões demonstrativas permanecem identificadas e bloqueadas. O modo demonstrativo só existe com `STUDIO_TEST_MODE=1` em Electron não empacotado ou com `testMode` explícito nos testes do núcleo.

`BlogEditor` usa Tiptap e mantém Markdown como formato persistido. Abrir uma revisão não grava conversões. Conteúdos fora do conjunto suportado permanecem no editor Markdown. `core/blog-html.mjs` produz a mesma estrutura de artigo para prévia e conectores; a UI também sanitiza o HTML. `core/rewrite.cjs` retorna propostas restritas ao artigo, legenda ou texto de um card, sem buscar fontes. Aplicar é uma ação separada; a UI confere revisão e conteúdo original para preservar alterações durante a chamada.

`core/assets.cjs` normaliza imagens estáticas JPEG, PNG e WebP em PNG sem metadados, guardado em `assets/<sha256>.png`. Referências relativas, coordenadas de enquadramento e hash acompanham o workspace. Os arquivos não são substituídos; remoção de um card não apaga mídia de revisões anteriores. `core/render.cjs` é compartilhado pela prévia Electron, exportação e publicação. Imagens ausentes, adulteradas ou fora do workspace impedem aprovação e envio. O hash dos JPEGs aprovados também detecta alterações de renderização entre máquinas.

O cofre portátil usa salt e IV aleatórios a cada gravação, AES-256-GCM e scrypt. Com **Lembrar neste computador**, a senha-mestra é cifrada pelo armazenamento seguro do Electron e indexada por um hash do caminho do workspace no diretório local do aplicativo. Essa lembrança não entra no workspace nem no backup. No Windows, a proteção usa DPAPI e fica vinculada à conta do sistema. Falhas de autenticação removem a lembrança inválida e não abrem o cofre. O bloqueio manual descarta as credenciais em memória e apaga a lembrança local; isso não promete apagar todas as cópias de memória geridas pelo runtime.

WordPress mantém ID remoto para atualização; timeout marca resultado incerto. Instagram persiste IDs de filhos e contêiner pai; a recuperação manual é necessária após falha. URLs públicas podem mudar depois da verificação; por isso precisam hospedar arquivos imutáveis. O aplicativo usa um serviço de mídia temporária no Cloudflare.

## Limites conhecidos da beta

- Teste real da transferência de workspace entre Windows e macOS, com cofre e assets.
- Publicação autorizada em WordPress e Instagram de homologação, incluindo timeout e token expirado.
- Fluxo de reconciliação de publicações acessível na interface, sem duplicar entregas externas.
- Distribuições assinadas e macOS notarizado.
- Orçamento rígido por execução, cancelamento abrangente e contextos limitados pelo modelo.
- Revisão de segurança, testes de migração de formato e validação mais estrita de dados importados.
- Aprovação sobre artigo final, imagens e destinos, com controle explícito de materiais derivados obsoletos.

Rodrigo autorizou a promoção para beta e o uso cotidiano por desenvolvedores em 13/09/2026. Mudanças futuras de estágio continuam sendo decisões explícitas do responsável.
