# Validação do alfa — 12/09/2026

## Conexões reais

O OAuth Instagram foi concluído para @rnaf.me com perfil e publicação. A identidade foi consultada na API oficial após a troca do código pelo Worker HTTPS do Cloudflare.

O WordPress.com foi autorizado para rnahumaf8.wordpress.com no plano gratuito, com posts e media. Foram confirmados o vínculo do token ao site e a consulta autenticada de posts. O endereço HTTP retornado pelo OAuth é normalizado para HTTPS. A consulta de informações gerais do site retorna 403 com esses escopos; a validação usa token-info e listagem de posts.

Os diagnósticos descartaram os tokens ao terminar. Nenhum conteúdo foi criado ou publicado. A conexão pelo aplicativo persiste o token no cofre criptografado após consentimento.

## Verificações locais

Testes cobrem histórico, transferência, cofre, bloqueio, cancelamento, aprovação por revisão e destino, idempotência e resultado incerto. Fixtures cobrem OAuth dos três provedores, isolamento de sessões, consumo único e roteamento dos tokens para endpoints oficiais. O smoke Electron usa IPC real, conecta contas fictícias, transfere o cofre e desconecta.

O painel foi inspecionado na prévia, que mantém conexão real desabilitada. A validação anterior cobriu o fluxo editorial em 360, 768 e 1280 px.

## Limites

A Meta mantém o aplicativo não publicado. Testadores convidados com conta profissional podem autorizar. O acesso sem convite depende da análise da Meta; o rascunho contém somente instagram_business_basic e instagram_business_content_publish. O painel exige um portfólio empresarial verificado, ainda não disponível nesta configuração. Nenhum pedido foi enviado para análise.

Publicação real e geração paga não foram testadas. Fixtures verificam publicize=false no WordPress.com para impedir compartilhamento automático em outras redes. Assinatura, notarização e transferência entre máquinas Windows e macOS continuam pendentes.
A versão 0.1.0-alpha.2 passou em 25 testes, build TypeScript/Vite e smoke Electron carregando o app.asar do pacote Windows.

## Blogger e primeiro acesso — alfa 0.1.0-alpha.3

Foram acrescentados conexão Google, listagem dos blogs autorizados, seleção do destino, renovação do token e publicação protegida pela aprovação da revisão. O segredo do cliente Google fica no Cloudflare; tokens pessoais ficam no cofre. Os testes usam fixtures para confirmar vínculo ao blog, idempotência, bloqueio após resposta incerta e ausência de tokens no snapshot. A API Blogger foi habilitada e o estado Enabled foi confirmado no Google Cloud. Cliente web, callback HTTPS, segredo no Cloudflare e testador Google estão configurados. O consentimento real da conta do testador será concluído por ele no próprio computador; não foi solicitado acesso à sua senha. Nenhum conteúdo do testador foi publicado.

## Pesquisa autônoma — alfa 0.1.0-alpha.4

A criação e a edição da pauta pedem apenas tema e briefing. O modelo do pesquisador planeja a consulta a partir da demanda e das últimas mensagens editoriais antes de consultar o PubMed. Uma busca sem resultados provoca uma reformulação, limitada a duas tentativas; falhas de serviço, cancelamento e plano inválido interrompem a execução. Sem fontes recuperadas, o redator não é chamado. Cada tentativa registra consulta, modelo, consumo e resultado no histórico portável; Fontes mostra a última consulta executada.

Os testes incluem planejamento sem termos manuais, persistência após reabrir o workspace, reformulação, cancelamento e falha externa. O formulário foi inspecionado na prévia. A qualidade da formulação pelo modelo real ainda não foi avaliada com chamadas pagas.

## Estado do OpenRouter — alfa 0.1.0-alpha.5

O snapshot informa apenas se uma chave OpenRouter está disponível no cofre desbloqueado, sem revelar a chave. A interface distingue cofre bloqueado, chave ausente e OpenRouter configurado. Em modo conectado, o botão de produção direciona à configuração quando falta o cofre ou a chave. A validação anterior à execução também diferencia chave ausente, cofre bloqueado e modelos não selecionados; uma falha de configuração não altera o estado da pauta. Mensagens recebidas pelo IPC deixam de exibir o prefixo técnico do Electron.

Os testes cobrem os três estados do cofre, ausência de chave sem mutação da pauta e persistência do indicador sem expor o segredo.

## Limites externos — alfa 0.1.0-alpha.6

O erro HTTP 429 observado ocorreu na primeira chamada OpenRouter do pesquisador, antes da consulta ao PubMed. O modelo selecionado continuava disponível no catálogo e possuía vários provedores. A requisição passa a permitir failover entre provedores do mesmo modelo, sem fallback para outro modelo. Um 429 com espera de até cinco segundos é repetido uma vez; persistência do limite produz mensagem específica para OpenRouter ou PubMed. Erros 401, 402 e 404 do OpenRouter orientam, respectivamente, chave, saldo e catálogo.

Testes verificam que o modelo não muda, que o failover de provedor está habilitado e que um 429 persistente faz exatamente duas tentativas antes do erro orientado. Nenhuma chamada paga foi usada nesse teste.
