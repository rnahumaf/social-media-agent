# Social Media Agent

Aplicativo desktop de produção editorial com pesquisa, artigo, carrossel e aprovação humana. **0.1.0-alpha.1 — esboço experimental.** Beta só começa com autorização explícita de Rodrigo para uso cotidiano dos desenvolvedores.

## Experimentar

No Windows, abra o executável portátil em `release/` e escolha uma pasta vazia para o workspace. Comece em **demonstração local**, crie uma pauta e clique em **Iniciar produção**. Edite o artigo e os cards, salve uma revisão e abra **Aprovação** para conferir os JPEGs e exportar.

Para desenvolver, use Node.js 22 ou superior:

```sh
npm ci
npm start
```

`npm run dev` abre uma prévia de interface em localhost. Ela usa exemplos e armazenamento do navegador: **não é o workspace desktop**, não recebe credenciais e não chama serviços externos.

## O que este alfa implementa

- Electron com React/TypeScript, preload restrito, isolamento de contexto e sandbox.
- Pasta independente da instalação, SQLite portável, histórico de mensagens, execuções e revisões.
- Fluxo pesquisador → redator → social media → revisor, com modelos individuais, catálogo OpenRouter e registro de consumo retornado pelo serviço.
- PubMed E-utilities: até seis registros por pauta, com resumo quando disponível. A interface diferencia metadados, resumo e demonstração.
- Artigo Markdown, legenda e cards editáveis. Novas gerações acrescentam versões e preservam as anteriores.
- Renderização local em JPEG 1080 × 1350. No desktop, a prévia e a exportação usam o mesmo renderizador.
- Cofre AES-256-GCM com chave derivada por scrypt e senha-mestra; credenciais desbloqueadas ficam no processo principal.
- Aprovação por revisão, canal e destino; editar exige aprovar novamente.
- Conector WordPress para publicação e atualização pelo ID remoto, com bloqueio após resultado incerto.
- Conector Instagram experimental por token de Instagram Login, criação de contêineres, verificação de processamento e publicação do carrossel. Compara os JPEGs públicos aos arquivos renderizados antes de enviar.

Nenhum conteúdo foi publicado em contas WordPress ou Instagram durante o desenvolvimento. Os conectores precisam de teste real em contas de homologação antes do uso cotidiano.

## Configurar serviços

1. Em **Modelos e conexões**, informe a senha-mestra e a chave OpenRouter no cofre.
2. Carregue o catálogo, selecione os quatro modelos, revise a memória editorial, desative a demonstração e salve.
3. Crie uma pauta com termos de busca PubMed, preferencialmente em inglês. A execução envia briefing, fontes e contexto editorial ao OpenRouter e a consulta ao NCBI. Há limite de 5.000 tokens de saída por chamada; não há orçamento monetário rígido neste alfa.
4. Para WordPress, configure URL HTTPS, usuário e Application Password. Use uma conta com permissões compatíveis com a publicação.
5. Para Instagram, configure manualmente a aplicação Meta e obtenha um token para conta profissional com `instagram_business_basic` e `instagram_business_content_publish`. Informe o ID e a versão Graph compatível com sua aplicação. O alfa não oferece OAuth, renovação automática de tokens nem hospedagem de imagens.
6. Exporte os JPEGs e hospede-os em URLs HTTPS estáveis, sem recompressão ou alteração. Informe uma URL por card, aprove e solicite a publicação. A confirmação nativa mostra a ação antes do envio.

Mudar o modo de trabalho não torna um material de demonstração publicável: gere uma nova revisão conectada. Conteúdo e revisão por LLM não substituem avaliação humana das evidências.

## Portabilidade e recuperação

Use **Copiar workspace** e escolha uma pasta vazia fora do workspace atual. A cópia inclui banco, manifesto e cofre, mas não o bloqueio de escrita. Abra a pasta copiada no aplicativo da outra máquina e desbloqueie com a mesma senha-mestra. **Um computador escreve por vez**; não há sincronização concorrente.

Os dados editoriais ficam legíveis no SQLite; apenas o cofre é criptografado. Use uma pasta adequada à sensibilidade do conteúdo. Não há recuperação da senha-mestra esquecida. Copiar tokens não impede expiração ou revogação.

Após encerramento abrupto, confirme que nenhuma instância usa a pasta antes de remover `.workspace.lock`. Execuções interrompidas preservam resultados salvos, mas uma nova geração recomeça o fluxo. Uma publicação com resultado incerto exige conferência no serviço e nunca é repetida automaticamente. A reconciliação WordPress por ID existe no IPC; sua interface dedicada e a retomada dos contêineres Instagram ainda estão pendentes.

O formato atual guarda o estado editorial versionado em uma linha SQLite e grava snapshots atômicos. Isso simplifica o alfa; bases grandes exigirão tabelas normalizadas, migrações incrementais e paginação. As mensagens completas ficam preservadas; o contexto usa as últimas 20 mensagens de conversa, a revisão anterior e a memória editorial, sem busca semântica automática.

## Verificação e distribuição

```sh
npm test
npm run build
npx electron tests/desktop-smoke.cjs
npm run package:win
# Executar em macOS:
npm run package:mac
```

O build Windows portátil inclui o runtime. O build macOS deve ser gerado e validado em macOS; assinatura e notarização ainda não estão configuradas. Os executáveis do alfa não são assinados. A CI verifica núcleo, build e empacotamento em Windows e macOS, com artefatos temporários.

## Decisões e próximos passos

O MVP usa um adaptador direto do OpenRouter em `core/providers.cjs`. Pi foi avaliado como base possível; não foi integrado neste alfa. O fluxo fixo dispensa ferramentas de terminal e mantém credenciais de publicação fora dos agentes. Veja [arquitetura e critérios de beta](docs/architecture.md) e [fontes técnicas](docs/references.md).

Antes de beta: validar contas reais e falhas de rede; automatizar OAuth e hospedagem; melhorar reconciliação; acrescentar limites de custo, retomada por etapa, edição independente do social, fontes de diretrizes e verificação de citações; testar migração Windows ↔ Mac em máquinas reais; assinar as distribuições.
