# Social Media Agent

Aplicativo desktop de produção editorial com pesquisa, artigo, carrossel e aprovação humana. **0.1.0-beta.4 — versão pública de testes.**

## Experimentar

Baixe a versão adequada diretamente na [página da versão 0.1.0-beta.4](https://github.com/rnahumaf/social-media-agent/releases/tag/v0.1.0-beta.4):

| Sistema | Download |
| --- | --- |
| Windows 10/11, 64 bits | [Social Media Agent 0.1.0-beta.4 para Windows](https://github.com/rnahumaf/social-media-agent/releases/download/v0.1.0-beta.4/Social.Media.Agent.0.1.0-beta.4.exe) |
| macOS 12 ou posterior com chip Apple M1, M2, M3, M4 ou posterior | [Social Media Agent 0.1.0-beta.4 para Apple Silicon](https://github.com/rnahumaf/social-media-agent/releases/download/v0.1.0-beta.4/Social.Media.Agent-0.1.0-beta.4-arm64-mac.zip) |
| macOS 12 ou posterior com processador Intel | [Social Media Agent 0.1.0-beta.4 para Intel](https://github.com/rnahumaf/social-media-agent/releases/download/v0.1.0-beta.4/Social.Media.Agent-0.1.0-beta.4-mac.zip) |

No Windows, abra o `.exe` baixado. No macOS, consulte **Sobre Este Mac** para identificar o chip, descompacte o `.zip` correspondente e mova o aplicativo para **Aplicativos**. Como esta beta ainda não é assinada nem notarizada, na primeira abertura pressione Control enquanto clica no aplicativo, escolha **Abrir** e confirme. Se o macOS ainda bloquear a execução, abra **Ajustes do Sistema → Privacidade e Segurança** e use **Abrir Mesmo Assim**.

Os ajustes editoriais descritos abaixo estão no código atual; os downloads acima correspondem à release já publicada. Ao abrir o aplicativo, escolha uma pasta vazia para o workspace. Em **Nova pauta**, selecione Blog, Instagram ou ambos e escolha **Criar com IA** ou **Escrever manualmente**. A escrita manual dispensa chave e conexões. O [guia de primeiro acesso](docs/first-access.md) explica os editores e a configuração opcional dos serviços.

Para desenvolver, use Node.js 22 ou superior:

```sh
npm ci
npm start
```

`npm run dev` abre uma prévia de interface em localhost. Ela usa exemplos e armazenamento do navegador: **não é o workspace desktop**, não recebe credenciais e não chama serviços externos.

## O que esta beta implementa

- Electron com React/TypeScript, preload restrito, isolamento de contexto e sandbox.
- Pasta independente da instalação, SQLite portável, histórico de mensagens, execuções e revisões.
- Fluxo com modelos individuais, catálogo OpenRouter e registro de consumo. Blog dispensa a etapa social; Instagram pode partir do briefing e das fontes, sem gerar artigo. Gerar um canal preserva o outro.
- Painel compacto de atividade com etapas, ferramentas e resultados persistidos. Falhas ficam pausadas e podem ser retomadas do último ponto salvo, com uma nova orientação do usuário.
- Saída estruturada do carrossel com JSON Schema, correção automática e ajuste local de último recurso para limites de 90 e 420 caracteres. A resposta original permanece no histórico.
- PubMed E-utilities e web aberta por OpenRouter/Exa. O pesquisador escolhe entre ferramentas permitidas por workspace ou pauta. Consultas, fontes e tipo de acesso ficam registrados; ausência de fontes interrompe a geração.
- Área **Conhecimento** para preferências gerais, orientações por canal e exemplos de escrita, salvos no workspace.
- Editor visual de blog com Markdown e prévia formatada. Formatação antiga não suportada permanece editável em Markdown, sem converter o original ao abrir.
- Legenda e cards manuais com inclusão, duplicação, remoção e ordenação. Reescrita com IA gera uma proposta para comparar, aplicar ou descartar; alterações durante a chamada impedem a aplicação sobre o texto modificado.
- Imagens locais JPEG, PNG e WebP, enquadramento, três modelos visuais, cores, família e tamanho da fonte e assinatura. Padrões do autor e estilo de cada revisão ficam salvos.
- Renderização local em JPEG 1080 × 1350 compartilhada entre prévia, exportação e publicação, com conferência dos bytes aprovados.
- Cofre AES-256-GCM com chave derivada por scrypt e senha-mestra; credenciais desbloqueadas ficam no processo principal. Com a opção **Lembrar neste computador**, o sistema operacional protege uma cópia local da senha para reabrir somente aquele workspace na mesma conta do computador.
- Aprovação por revisão, canal e destino; editar exige aprovar novamente.
- Conector WordPress para publicação e atualização pelo ID remoto, com bloqueio após resultado incerto.
- Conector Blogger com login Google, seleção de blog, renovação de acesso e publicação vinculada à revisão aprovada.
- Conector Instagram experimental por OAuth de Instagram Login, hospedagem temporária dos JPEGs no Cloudflare, comparação byte a byte, criação de contêineres e publicação do carrossel. As cópias temporárias são removidas após o processamento e expiram em um dia se o fluxo for interrompido.

Os conectores usam aprovação explícita por revisão e destino. O histórico de validação real fica em [docs/validation.md](docs/validation.md).

## Configurar serviços

1. Em **Modelos e conexões**, informe a senha-mestra e a chave OpenRouter no cofre.
2. Carregue o catálogo, selecione os modelos e salve. Em **Conhecimento**, registre suas preferências. Em **Ferramentas de pesquisa**, permita PubMed, web aberta ou ambos; a pauta pode ter sua própria seleção.
3. Descreva o tema, o público e o objetivo da pauta. O pesquisador escolhe a ferramenta e formula a consulta; sem fontes, reformula uma vez antes de interromper. As consultas ficam em **Fontes**. O OpenRouter recebe briefing, fontes e preferências; PubMed recebe a consulta, e buscas web usam OpenRouter/Exa. Há limite de 5.000 tokens de saída por chamada e limites por busca web; não há orçamento monetário rígido nesta beta.
4. Para WordPress.com, clique em **Conectar WordPress.com** e autorize seu site no navegador. Para hospedagem própria, configure URL HTTPS, usuário e Application Password. Para Blogger, use **Conectar Blogger com Google** e selecione seu blog.
5. Para Instagram, desbloqueie o cofre e clique em **Conectar Instagram**. Use uma conta profissional de criador ou empresa. O usuário autoriza perfil e publicação no navegador, sem copiar IDs ou tokens. O serviço está implantado no Cloudflare e hospeda os JPEGs temporariamente para o processamento da Meta. O acesso de contas sem função no aplicativo será liberado quando a Meta concluir a análise de acesso.
6. Em **Revisar e publicar**, confira o artigo formatado, os cards e a legenda dos canais selecionados. Aprove e publique cada destino separadamente. Conectar duas contas não obriga publicar em ambas. O aplicativo hospeda os cards temporariamente e a confirmação nativa mostra a ação antes do envio. Workspaces conectados em versões anteriores precisam reconectar o Instagram uma vez.

Não há pesquisa demonstrativa na interface pública. Revisões demonstrativas antigas continuam identificadas e bloqueadas para publicação; regenerar parcialmente conserva essa procedência. Simulações ficam restritas às ferramentas de desenvolvimento. Escrita manual e reescrita dispensam pesquisa externa.

## Portabilidade e recuperação

Use **Copiar workspace** e escolha uma pasta vazia fora do workspace atual. A cópia inclui banco, manifesto, imagens imutáveis e cofre, mas não o bloqueio de escrita nem a lembrança protegida pelo sistema. Abra a pasta copiada no aplicativo da outra máquina e desbloqueie com a mesma senha-mestra. **Um computador escreve por vez**; não há sincronização concorrente.

Os dados editoriais ficam legíveis no SQLite; apenas o cofre é criptografado. Use uma pasta adequada à sensibilidade do conteúdo. Não há recuperação da senha-mestra esquecida. Copiar tokens não impede expiração ou revogação.

Após encerramento abrupto, confirme que nenhuma instância usa a pasta antes de remover `.workspace.lock`. Execuções interrompidas preservam a consulta, as fontes, os textos parciais e o histórico de atividade. Ao reabrir, use **Tentar novamente** para continuar da etapa interrompida; uma orientação opcional passa a integrar o contexto dos agentes. Uma publicação com resultado incerto exige conferência no serviço e nunca é repetida automaticamente. A reconciliação WordPress por ID existe no IPC; sua interface dedicada e a retomada dos contêineres Instagram ainda estão pendentes.

O formato atual guarda o estado editorial versionado em uma linha SQLite e grava snapshots atômicos. Isso simplifica a beta; bases grandes exigirão tabelas normalizadas, migrações incrementais e paginação. As mensagens completas ficam preservadas; o contexto usa as últimas 20 mensagens de conversa, a revisão anterior e a memória editorial, sem busca semântica automática.

## Verificação e distribuição

```sh
npm test
npm run build
npx electron tests/desktop-smoke.cjs
npm run test:editorial-desktop
npm run package:win
# Executar em macOS:
npm run package:mac
```

O build Windows portátil inclui o runtime. O build macOS deve ser gerado e validado em macOS; assinatura e notarização ainda não estão configuradas. Os executáveis da beta não são assinados. A CI verifica núcleo, build e empacotamento em Windows e macOS, com artefatos temporários.

## Decisões e próximos passos

O MVP usa um adaptador direto do OpenRouter em `core/providers.cjs`. Pi foi avaliado como base possível; não foi integrado nesta beta. O fluxo fixo dispensa ferramentas de terminal e mantém credenciais de publicação fora dos agentes. Veja [arquitetura](docs/architecture.md) e [fontes técnicas](docs/references.md).

Limites conhecidos da beta: melhorar reconciliação; acrescentar limites de custo e verificação de citações; testar migração Windows ↔ Mac em máquinas reais; assinar as distribuições.

WordPress.com também oferece conexão OAuth pelo botão **Conectar WordPress.com**, com seleção do site e autorização de posts e mídia. Sites com hospedagem própria mantêm a configuração de senha de aplicativo.
Para começar, siga o [guia de primeiro acesso](docs/first-access.md). Cada pessoa cria seu próprio workspace e conecta suas próprias contas.

A formulação de buscas usa termos livres e operadores do PubMed conforme a [documentação oficial](https://pubmed.ncbi.nlm.nih.gov/help/). O planejamento usa o modelo escolhido para o pesquisador e seu consumo é registrado nas execuções.
