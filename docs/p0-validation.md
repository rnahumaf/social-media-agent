# P0: fluxo editorial, cancelamento e proveniência

## Alterações

- Publicação deriva os controles do destino, revisão enviada, revisão atual e estado da tentativa. WordPress/Blogger oferecem atualização do post existente; Instagram publicado não oferece reenvio da mesma pauta.
- Recuperação disponível no próprio destino. As verificações fazem leituras das APIs e nunca repetem automaticamente um envio incerto. `FINISHED` no Instagram não é confundido com `PUBLISHED`. Vincular um ID manualmente não comprova igualdade dos cards.
- Respostas HTTP de rejeição definitiva e falhas anteriores à submissão final podem ser tentadas novamente explicitamente. Timeout ou resposta ambígua após a submissão permanecem incertos.
- Cada operação possui identidade, pauta, estado e capacidade de cancelamento. Conversa, geração, reescrita e conexão autorizável recebem sinais próprios. Um cancelamento antigo não alcança uma operação nova.
- Conversa cancelada preserva a mensagem, e a repetição do mesmo envio usa o identificador original. Reescrita cancelada não produz proposta aplicável.
- Fontes e consultas acompanham a revisão. Pesquisa posterior aparece separada. Avaliações da IA registram revisão, escopo e impressão digital do conteúdo/briefing; avaliações antigas são indicadas como desatualizadas ou sem vínculo verificável.

## Testes

`npm test` inclui `p0-state.test.cjs` e `p0-flow.test.cjs`. `npm run test:editorial-desktop` executa também `p0-desktop.cjs`, com Electron e IPC reais, workspaces descartáveis e respostas externas controladas.

Nenhum teste publica conteúdo em contas reais nem consome chamadas pagas. O sucesso desses testes valida os estados, a integração local e os contratos simulados; não substitui uma verificação ao vivo dos provedores.

A recuperação inclui conferência manual explícita quando o usuário verifica o destino e não encontra o envio. Ela preserva a tentativa no histórico, distingue a declaração do usuário da verificação da API e não publica conteúdo. As etapas de verificação das conexões também recebem o sinal de cancelamento, com limpeza remota limitada a três segundos.
