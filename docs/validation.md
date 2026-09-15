# Validação da beta — 14/09/2026

## Ajustes editoriais do beta desktop — código atual

O núcleo passou em 76 testes. O build TypeScript/Vite e os dois smokes Electron passaram no Windows: `npm run test:desktop` e `npm run test:editorial-desktop`. O build informa o tamanho do bundle do editor e ignora uma diretiva `use client` do Tiptap; não houve erro de compilação.

As regressões cobrem escopo de blog e Instagram, payload do Blogger contendo só o artigo, geração social sem redator, retomada sem sobrescrever edições, fontes da nova revisão, preferências migradas e demonstrações antigas bloqueadas. O pipeline confirma que o prompt do redator recebe a skill `rn-natural-writing` empacotada no runtime, junto das preferências do workspace. Aprovação do blog independe de cards inválidos; Instagram exige legenda e cards. Imagens, estilos, título e destino entram na verificação, e mídias adulteradas impedem envio. O tamanho da fonte altera o JPEG e persiste na cópia portável; estilos antigos continuam equivalentes a 100% sem mudar o formato usado no hash de aprovação. Os testes existentes de cofre, portabilidade e resultado externo incerto continuam passando.

O aceite usa Electron e IPC reais com textos, credenciais, imagens e respostas externas fictícios em pastas temporárias. Ele cria uma pauta manual pela interface sem chave, edita e reabre Markdown e editor visual, preserva tabela e lista de tarefas antigas, aplica e descarta propostas, testa edição durante reescrita, importa imagem, salva enquadramento e estilo, duplica/ordena/remove cards, salva conhecimento e ferramentas de pesquisa e reabre uma cópia portável. O cancelamento do fechamento conserva o workspace e o rascunho não salvo.

Inspeção visual exclusivamente desktop em áreas de conteúdo de 780 × 640 e 1440 × 940, também a 125% de zoom. Foram conferidos editores, estados vazios, prévia, comparação de reescrita, controle de tamanho da fonte em 115%, rolagem e ações de aprovação. O teste verifica ausência de rolagem horizontal no documento e contenção do foco no diálogo. As imagens usadas nas capturas eram fixtures temporárias e foram descartadas; nenhum dado de usuário foi registrado.

Esta alteração não valida buscas pagas no OpenRouter/Exa nem publicações reais nos provedores. O contrato externo foi conferido na documentação e testado com respostas controladas. Transferência entre máquinas Windows/macOS e aparência das fontes no macOS continuam pendentes; uma mudança nos JPEGs exige nova aprovação.

## Acesso público aos provedores

O aplicativo OAuth do Google está externo e **In production**. O escopo `https://www.googleapis.com/auth/blogger` foi declarado em Data Access e aparece como não sensível; qualquer conta Google pode iniciar o consentimento sem integrar uma lista de testadores. A API Blogger, o cliente web, o callback HTTPS e o segredo no Worker estão configurados.

O WordPress.com usa o consentimento próprio do usuário, sem lista de convites no produto. O fluxo foi validado em uma conta real com os escopos `posts media`.

Na Meta, o callback, o segredo e as duas permissões mínimas foram validados com uma conta profissional. As páginas públicas, o domínio, o nome, a categoria, as descrições de uso e as instruções para o analista estão preparados. A solicitação de análise `1352443806693627` ainda exige verificação do portfólio empresarial, respostas de tratamento de dados, anexo da gravação e reconhecimento da chamada obrigatória pela Meta. A publicação para contas de terceiros depende da aprovação; até lá, somente contas com função no aplicativo conseguem concluir o Instagram Login.

## Conexões reais

O OAuth Instagram foi concluído para @rnaf.me com perfil e publicação. A identidade foi consultada na API oficial após a troca do código pelo Worker HTTPS do Cloudflare. Em 13/09/2026, um carrossel real de quatro cards foi publicado com sucesso: o workspace persistiu os quatro IDs de filhos, o contêiner pai e o media ID, e registrou a remoção da mídia temporária. A gravação integral de 79 segundos foi revisada em 1920 × 1200 para a análise da Meta.

O WordPress.com foi autorizado para rnahumaf8.wordpress.com no plano gratuito, com posts e media. Foram confirmados o vínculo do token ao site e a consulta autenticada de posts. O endereço HTTP retornado pelo OAuth é normalizado para HTTPS. A consulta de informações gerais do site retorna 403 com esses escopos; a validação usa token-info e listagem de posts.

Os diagnósticos descartaram os tokens ao terminar. Nenhum conteúdo foi criado ou publicado. A conexão pelo aplicativo persiste o token no cofre criptografado após consentimento.

## Verificações locais

Testes cobrem histórico, transferência, cofre, bloqueio, cancelamento, aprovação por revisão e destino, idempotência e resultado incerto. Fixtures cobrem OAuth dos três provedores, isolamento de sessões, consumo único e roteamento dos tokens para endpoints oficiais. O smoke Electron usa IPC real, conecta contas fictícias, transfere o cofre e desconecta.

O painel foi inspecionado na prévia, que mantém conexão real desabilitada. A validação anterior cobriu o fluxo editorial em 360, 768 e 1280 px.

## Limites

A Meta mantém o aplicativo não publicado enquanto os requisitos de análise de acesso não forem concluídos. O acesso sem convite depende da análise da Meta; a integração solicita somente `instagram_business_basic` e `instagram_business_content_publish`.

Publicação real e geração paga não foram testadas. Fixtures verificam publicize=false no WordPress.com para impedir compartilhamento automático em outras redes. Assinatura, notarização e transferência entre máquinas Windows e macOS continuam pendentes.
A versão 0.1.0-alpha.2 passou em 25 testes, build TypeScript/Vite e smoke Electron carregando o app.asar do pacote Windows.

## Beta pública — 0.1.0-beta.1

O repositório e a release são públicos. Google/Blogger está em produção e WordPress.com usa o consentimento próprio do usuário, sem convite. No Instagram, a distribuição continua limitada pela análise externa da Meta. O login passou a aceitar que o identificador técnico retornado pela troca OAuth seja diferente do `user_id` profissional confirmado por `/me`; o aplicativo continua usando somente a identidade profissional verificada para publicar.

## Compatibilidade com macOS 12 — 0.1.0-beta.2

O runtime foi fixado no Electron 43.7.0, a última série anterior à remoção do macOS 12, e o pacote declara macOS 12.0 como versão mínima. A distribuição gera arquivos separados em runners Apple Silicon e Intel. O CI lê `LSMinimumSystemVersion` do aplicativo empacotado e exige o valor `12.0` antes de guardar cada artefato. Assinatura e notarização permanecem pendentes.

## Blogger e primeiro acesso — alfa 0.1.0-alpha.3

Foram acrescentados conexão Google, listagem dos blogs autorizados, seleção do destino, renovação do token e publicação protegida pela aprovação da revisão. O segredo do cliente Google fica no Cloudflare; tokens pessoais ficam no cofre. Os testes usam fixtures para confirmar vínculo ao blog, idempotência, bloqueio após resposta incerta e ausência de tokens no snapshot. A API Blogger foi habilitada e o estado Enabled foi confirmado no Google Cloud. Cliente web, callback HTTPS e segredo no Cloudflare estão configurados. Em 13/09/2026, o OAuth externo passou para produção e o escopo Blogger foi declarado como não sensível. Nenhum conteúdo do testador foi publicado.

## Pesquisa autônoma — alfa 0.1.0-alpha.4

A criação e a edição da pauta pedem apenas tema e briefing. O modelo do pesquisador planeja a consulta a partir da demanda e das últimas mensagens editoriais antes de consultar o PubMed. Uma busca sem resultados provoca uma reformulação, limitada a duas tentativas; falhas de serviço, cancelamento e plano inválido interrompem a execução. Sem fontes recuperadas, o redator não é chamado. Cada tentativa registra consulta, modelo, consumo e resultado no histórico portável; Fontes mostra a última consulta executada.

Os testes incluem planejamento sem termos manuais, persistência após reabrir o workspace, reformulação, cancelamento e falha externa. O formulário foi inspecionado na prévia. A qualidade da formulação pelo modelo real ainda não foi avaliada com chamadas pagas.

## Estado do OpenRouter — alfa 0.1.0-alpha.5

O snapshot informa apenas se uma chave OpenRouter está disponível no cofre desbloqueado, sem revelar a chave. A interface distingue cofre bloqueado, chave ausente e OpenRouter configurado. Em modo conectado, o botão de produção direciona à configuração quando falta o cofre ou a chave. A validação anterior à execução também diferencia chave ausente, cofre bloqueado e modelos não selecionados; uma falha de configuração não altera o estado da pauta. Mensagens recebidas pelo IPC deixam de exibir o prefixo técnico do Electron.

Os testes cobrem os três estados do cofre, ausência de chave sem mutação da pauta e persistência do indicador sem expor o segredo.

## Limites externos — alfa 0.1.0-alpha.6

O erro HTTP 429 observado ocorreu na primeira chamada OpenRouter do pesquisador, antes da consulta ao PubMed. O modelo selecionado continuava disponível no catálogo e possuía vários provedores. A requisição passa a permitir failover entre provedores do mesmo modelo, sem fallback para outro modelo. Um 429 com espera de até cinco segundos é repetido uma vez; persistência do limite produz mensagem específica para OpenRouter ou PubMed. Erros 401, 402 e 404 do OpenRouter orientam, respectivamente, chave, saldo e catálogo.

Testes verificam que o modelo não muda, que o failover de provedor está habilitado e que um 429 persistente faz exatamente duas tentativas antes do erro orientado. Nenhuma chamada paga foi usada nesse teste.

## Sessões retomáveis — alfa 0.1.0-alpha.7

Cada execução passa a armazenar eventos de atividade e artefatos parciais no workspace. O painel mostra o agente ativo, chamadas ao OpenRouter e PubMed, consultas, quantidade de fontes, saídas concluídas e falhas. Ele apresenta resumos operacionais e não expõe o raciocínio interno bruto do modelo.

Uma falha pausa a sessão no pesquisador, redator, social media ou revisor. **Tentar novamente** conserva as etapas anteriores; uma orientação opcional é persistida na conversa e enviada às etapas retomadas. Artigos concluídos antes de uma falha posterior ficam visíveis como rascunho parcial. Ao abrir um workspace das versões anteriores, uma execução incompleta é convertida em sessão retomável com as fontes e respostas disponíveis.

O modelo `z-ai/glm-5.3-flash` informa raciocínio obrigatório e esforço máximo por padrão no catálogo OpenRouter. As chamadas agora solicitam esforço baixo e excluem esse conteúdo da resposta, reservando parte do limite para o texto final. Respostas textuais segmentadas também são normalizadas. Os testes cobrem persistência após reabrir, migração do formato anterior, retomada sem nova consulta ao PubMed, orientação do usuário e respostas sem texto final. O painel foi inspecionado na prévia próximo da largura mínima da janela.

## Contratos e publicação direta — alfa 0.1.0-alpha.8

A falha real do agente social foi reproduzida com quatro corpos acima de 420 caracteres. O workspace continha as seis fontes, o dossiê, o artigo e a resposta social completa. A nova retomada recupera essa resposta, ajusta somente os limites e segue ao revisor sem repetir as etapas anteriores. Novas chamadas sociais solicitam JSON Schema estrito ao OpenRouter; uma resposta inválida provoca uma correção automática e, para estruturas completas com excesso de texto, existe ajuste local de último recurso. A interface recebe mensagens legíveis e mantém os payloads originais apenas no histórico da sessão.

Uma matriz local executa seis pautas editoriais com respostas válidas, cercadas por Markdown, malformadas, com oito cards, caracteres acentuados, emoji e limites excedidos. Os testes também cobrem falha da correção externa, retomada do material salvo, 429, resposta vazia, portabilidade do workspace e publicação idempotente ou incerta. Três consultas reais ao PubMed retornaram seis registros cada. O modelo escolhido `z-ai/glm-5.3-flash` foi confirmado no catálogo do OpenRouter com suporte a `response_format` e `structured_outputs`.

O serviço Cloudflare recebeu um bucket R2 exclusivo para JPEGs temporários. O token de upload é emitido somente após OAuth Instagram, fica no cofre e é vinculado à conta autorizada. O Worker rejeita outro titular, serve o JPEG exato à Meta e aceita remoção autenticada; o aplicativo apaga as cópias após o processamento. Uma regra do bucket elimina objetos remanescentes em um dia. O endpoint de saúde implantado confirmou Instagram, WordPress.com, Blogger e mídia configurados.

## Reabertura do cofre — alfa 0.1.0-alpha.9

A senha-mestra pode ser lembrada fora do workspace, cifrada pelo armazenamento seguro do sistema operacional. O identificador persistido é um hash do caminho normalizado; o arquivo local não contém o caminho nem a senha em texto puro. O aplicativo testa a reabertura automática por IPC real, confirma que outro workspace continua bloqueado e verifica que **Bloquear e esquecer neste computador** remove a lembrança. A cópia portátil continua exigindo a senha na primeira abertura em outro caminho.

## Renderização adaptativa — alfa 0.1.0-alpha.10

O template seleciona a primeira escala tipográfica que mantém título e corpo acima dos mínimos de legibilidade, dentro da área anterior ao rodapé. Um teste de fronteira produz JPEG 1080 × 1350 com um corpo de 420 caracteres. Os quatro cards do workspace real que revelou o problema, com corpos entre 415 e 419 caracteres, também foram renderizados em memória; três mantiveram 36 px e um foi ajustado para 34 px. A interface compartilha uma única geração entre as miniaturas do mesmo carrossel, em vez de repetir a chamada para cada card.
