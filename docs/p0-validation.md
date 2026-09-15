# P0: fluxo editorial, cancelamento e proveniência

## Alterações

A interface de publicação deriva os controles do destino, da revisão enviada, da revisão atual e do estado da tentativa. WordPress e Blogger oferecem atualização do post existente. Uma pauta já publicada no Instagram não oferece reenvio. Autorizações ausentes direcionam à configuração em vez de oferecer uma operação que será rejeitada.

A recuperação fica no próprio destino, sem nova tela permanente. As verificações consultam as APIs e nunca repetem automaticamente um envio incerto. No Instagram, `FINISHED` não é confundido com `PUBLISHED`; vincular um ID manualmente não comprova igualdade dos cards. No blog, o conteúdo remoto é comparado com a revisão da tentativa, não com uma edição posterior.

A recuperação inclui uma conferência manual explícita quando o usuário verifica o destino e não encontra o envio. Ela preserva a tentativa no histórico e distingue a declaração do usuário da confirmação da API. Apenas libera uma nova tentativa solicitada pelo usuário, sem publicar conteúdo por conta própria. Falhas de transporte após submissão permanecem incertas; rejeições definitivas ou falhas anteriores à chamada final podem ser tentadas novamente explicitamente.

Cada operação possui identidade, pauta, estado e capacidade de cancelamento. Conversa, geração, reescrita e conexões recebem sinais próprios. Cancelar uma operação antiga não alcança outra operação. As verificações de conexão encaminham o sinal, e a limpeza remota após OAuth tem prazo de três segundos. Operações não canceláveis não exibem um cancelamento fictício.

Conversa cancelada preserva a mensagem; tentar novamente o mesmo envio reutiliza o identificador original. Reescrita cancelada não produz proposta aplicável e mantém as edições locais feitas durante a chamada. Propostas e respostas sem snapshot atualizam o estado final antes de devolver os controles ao editor.

Fontes e consultas acompanham a revisão. Uma pesquisa posterior aparece separadamente. Avaliações da IA registram revisão, canais conferidos e impressão digital do conteúdo e briefing. Edições tornam avaliações anteriores desatualizadas. Avaliações antigas sem metadados são identificadas como sem vínculo verificável, não apresentadas como revisão do conteúdo atual.

## Validação executada em 15/09/2026

A execução Windows [35031381117](https://github.com/rnahumaf/social-media-agent/actions/runs/35031381117) validou o código antes do commit `cd84c3e8605fe529d3bc25a102d3d0223da7cf04`:

- `npm test`: 95 testes do núcleo e integração, incluindo os 19 novos testes P0.
- `npm run build`: TypeScript e Vite concluídos.
- `npm run test:desktop`: Electron e IPC reais, incluindo persistência, exportação e conexões simuladas.
- `npm run test:editorial-desktop`: aceite editorial existente e o novo `p0-desktop.cjs`, ambos concluídos.

O novo aceite desktop cobre recuperação sem publicar, atualização de blog, ausência de reenvio do Instagram, fontes separadas por revisão, avaliação desatualizada, operações não canceláveis, cancelamento com identidade, repetição da conversa sem duplicar a mensagem, edição durante reescrita cancelada e conferência manual registrada. Também verifica a ausência de transbordamento horizontal na largura de 780 px. O aceite editorial existente cobre 780 × 640, 1440 × 940 e zoom de 125%.

Os testes usam workspaces descartáveis e respostas externas controladas. Nenhum conteúdo foi publicado em contas reais e nenhuma chamada paga de modelo foi realizada. O sucesso valida estados, integração local e contratos simulados; não substitui verificação ao vivo dos provedores.

As mudanças reutilizam os destinos, editores e área de fontes existentes. Redesenho geral, salvamento automático, cache de renderização e otimização ampla de contexto continuam fora deste P0. A versão do aplicativo e os instaladores publicados anteriormente não foram substituídos.
