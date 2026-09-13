# Arquitetura da beta

O aplicativo mantém três fronteiras: React apresenta e edita; o processo principal Electron controla os comandos; `core/` guarda dados, executa o fluxo e conecta serviços. O renderer não acessa Node, filesystem nem tokens salvos. Conteúdo gerado é apresentado como texto ou imagem local.

`Workspace` é dono da persistência. O bloqueio exclusivo impede duas instâncias de abrirem a mesma pasta. Cada alteração salva o banco completo por arquivo temporário e rename. O backup ocorre sem outra mutação em andamento e pode ser aberto diretamente; não é um arquivo ZIP.

Cada projeto guarda briefing, query, fontes, mensagens, sessões, execuções, revisões e estado de publicação por canal. A sessão registra um cursor de retomada, artefatos parciais e eventos de status, ferramenta, resultado, saída, falha e orientação. Cada evento é gravado atomicamente antes da etapa seguinte. Revisões incluem fonte e origem demonstrativa. A aprovação calcula SHA-256 sobre revisão, versão do template, canal e destino. O conector verifica esse hash antes de escrever externamente. IDs remotos nunca vêm da LLM.

O fluxo é sequencial. PubMed é ferramenta programática do pesquisador; os quatro papéis usam chamadas independentes com instruções específicas. A resposta social passa por validação de campos e limites antes de virar revisão. Quando uma chamada falha, a sessão fica pausada no cursor atual; a retomada reconstitui os artefatos persistidos e executa apenas a etapa pendente e as seguintes. A orientação opcional do usuário é registrada na sessão e na conversa editorial. Saídas e solicitações são preservadas para auditoria local. O contexto de conversa exclui mensagens internas para evitar expansão recursiva de prompts.

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
