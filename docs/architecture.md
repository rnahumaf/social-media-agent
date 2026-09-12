# Arquitetura do alfa

O aplicativo mantém três fronteiras: React apresenta e edita; o processo principal Electron controla os comandos; `core/` guarda dados, executa o fluxo e conecta serviços. O renderer não acessa Node, filesystem nem tokens salvos. Conteúdo gerado é apresentado como texto ou imagem local.

`Workspace` é dono da persistência. O bloqueio exclusivo impede duas instâncias de abrirem a mesma pasta. Cada alteração salva o banco completo por arquivo temporário e rename. O backup ocorre sem outra mutação em andamento e pode ser aberto diretamente; não é um arquivo ZIP.

Cada projeto guarda briefing, query, fontes, mensagens, execuções, revisões e estado de publicação por canal. Revisões incluem fonte e origem demonstrativa. A aprovação calcula SHA-256 sobre revisão, versão do template, canal e destino. O conector verifica esse hash antes de escrever externamente. IDs remotos nunca vêm da LLM.

O fluxo é sequencial. PubMed é ferramenta programática do pesquisador; os quatro papéis usam chamadas independentes com instruções específicas. A resposta social passa por validação de campos e limites antes de virar revisão. Saídas e solicitações são preservadas para auditoria local. O contexto de conversa exclui mensagens internas para evitar expansão recursiva de prompts.

O cofre usa salt e IV aleatórios a cada gravação, AES-256-GCM e scrypt. A senha-mestra não é gravada. Falhas de autenticação não abrem o cofre. O bloqueio manual descarta a referência às credenciais em memória; isso não promete apagar todas as cópias de memória geridas pelo runtime.

WordPress mantém ID remoto para atualização; timeout marca resultado incerto. Instagram persiste IDs de filhos e contêiner pai; a recuperação manual é necessária após falha. URLs públicas podem mudar depois da verificação; por isso precisam hospedar arquivos imutáveis. O alfa não controla o servidor de mídia.

## Critérios antes de beta

- Aprovação explícita de Rodrigo para uso cotidiano.
- Teste real da transferência de workspace entre Windows e macOS, com cofre e assets.
- Publicação autorizada em WordPress e Instagram de homologação, incluindo timeout e token expirado.
- Fluxo de reconciliação acessível na interface e retomada de etapas sem duplicar entregas.
- Distribuições assinadas e macOS notarizado.
- Orçamento rígido por execução, cancelamento abrangente e contextos limitados pelo modelo.
- Revisão de segurança, testes de migração de formato e validação mais estrita de dados importados.
- Aprovação sobre artigo final, imagens e destinos, com controle explícito de materiais derivados obsoletos.

Nenhuma promoção automática de alfa para beta faz parte da CI.
