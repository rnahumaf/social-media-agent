# Validação do alfa

Verificações locais em Windows, 12/09/2026:

- Testes do núcleo: transferência, histórico, revisões, cofre, senha incorreta, bloqueio de workspace, proteção de backup, cancelamento, renderização JPEG, aprovação, idempotência WordPress e bloqueio após timeout.
- Contratos externos com respostas simuladas: escolha de modelo OpenRouter, limite de saída, resposta truncada e leitura PubMed com/sem resumo.
- Smoke do Electron real: preload isolado sem `require` no renderer, criação de pauta, geração demonstrativa, JPEG, exportação e abertura do workspace copiado.
- O mesmo smoke também passou carregando os módulos e assets do `app.asar` empacotado.
- Build TypeScript/Vite e auditoria de dependências.
- Consultas reais sem credenciais: catálogo OpenRouter (445 modelos retornados) e PubMed (seis registros). Isso valida conectividade e leitura, não a geração paga.
- Inspeção visual da prévia local: estado vazio, criação de pauta, artigo e carrossel; larguras de 360, 768 e 1280 px. Edição humana salvou uma segunda revisão e permaneceu após recarregar.

Limites: chamadas de geração pagas e publicação real não foram executadas; nenhum token do usuário foi solicitado ou utilizado. Testes de conectores usam fixtures. A prévia de navegador demonstra o layout; o smoke desktop usa a persistência e o renderizador reais. Transferência entre duas pastas na mesma máquina não comprova migração Windows ↔ macOS. Assinatura, notarização e operação em contas reais continuam pendentes.


## Login Instagram simplificado — 12/09/2026

Implementados botão de conexão, consentimento no navegador, identidade consultada na Meta, gravação criptografada do token, verificação de conta e desconexão local. Campos manuais de token e ID foram removidos da interface.

Passaram 21 testes unitários/integrados com fixtures e o teste Electron com IPC real, incluindo OAuth simulado, transferência do cofre e desconexão. O painel foi inspecionado no navegador na largura disponível (~807 px), sem sobreposição no bloco Instagram. O preview deixa claro que não conecta contas reais.

Worker publicado no Cloudflare; `/health` respondeu `ok` e indicou segredo ainda não configurado. Callback cadastrado no painel Meta. Ainda não há autorização validada de @rnaf.me, token real obtido ou publicação de teste. A configuração do segredo aguarda autenticação no painel Cloudflare; a conta de teste aguarda login no Instagram. Validação WordPress.com solicitada para depois do Instagram.
