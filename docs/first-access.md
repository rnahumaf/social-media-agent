# Primeiro acesso — código atual da beta

Abra o aplicativo no seu computador e escolha uma pasta vazia para guardar seu trabalho. Clique em **Nova pauta**, selecione Blog, Instagram ou ambos e escolha como começar. **Escrever manualmente** abre os editores imediatamente e dispensa chave OpenRouter. **Criar com IA** usa os modelos configurados; se faltar a chave, o aplicativo indica onde configurá-la e mantém o editor disponível.

No blog, escolha **Visual**, **Markdown** ou **Prévia**. O texto continua salvo em Markdown; versões com formatação não suportada abrem em Markdown para preservar o original. No Instagram, edite a legenda, acrescente cards e use as miniaturas para selecionar qual editar. Os controles permitem duplicar, remover e ordenar cards, importar imagens JPEG, PNG ou WebP e ajustar enquadramento, cores, fonte e assinatura. **Salvar como meu padrão** guarda o estilo para outras pautas.

**Reescrever com IA** funciona no artigo, na legenda e no card selecionado. Compare a sugestão com o original antes de aplicar. Se o texto mudar durante a chamada, descarte a sugestão e solicite outra. **Salvar revisão** preserva a versão anterior e invalida a aprovação. Em **Revisar e publicar**, aprove e publique cada destino separadamente, mesmo quando ambas as contas estiverem conectadas.

Abra **Conhecimento** na navegação ou **Preferências do autor** perto dos editores. Salve orientações gerais, preferências de blog e Instagram e exemplos da sua escrita. Há um perfil de autor por workspace.

A configuração abaixo é necessária para usar IA ou publicar em contas externas. A tela **Modelos e conexões** apresenta as conexões disponíveis. Faça login nas suas contas diretamente no navegador; não envie suas senhas ao responsável pelo teste.

1. **Proteja suas conexões.** Crie uma senha-mestra com pelo menos dez caracteres. Deixe **Lembrar neste computador** marcado para reabrir este workspace automaticamente na mesma conta do sistema. Para gerar conteúdo no modo conectado, informe também sua chave OpenRouter e clique em **Criar ou desbloquear cofre**. Guarde a senha: uma cópia levada a outro computador continuará pedindo-a e não há recuperação. O aplicativo mostra separadamente se o cofre está desbloqueado e se a chave OpenRouter está salva.
2. **Conecte o Instagram.** Use uma conta profissional de criador ou empresa. Clique em **Conectar Instagram**, entre na sua própria conta e autorize perfil e publicação no navegador. Ao retornar, confira seu @ e use **Verificar conexão**. Durante a análise de acesso da Meta, o conector permanece disponível somente para contas com função no aplicativo; essa limitação será removida na publicação.
3. **Conecte o Blogger.** Clique em **Conectar Blogger com Google** e entre com a conta que administra o blog. Autorize o acesso e volte ao app. Se houver vários blogs, escolha o destino na lista. Confira o endereço e clique em **Verificar conexão**. Isso apenas consulta o acesso; não publica.

Mantenha o aplicativo aberto enquanto autoriza no navegador. Se cancelar ou a sessão expirar, clique novamente em Conectar. Não é necessário compartilhar a tela nem fazer login no computador de outra pessoa.

## Contas compatíveis

Contas Instagram pessoais comuns não são compatíveis com a API de publicação. Converta a conta para profissional, como criador ou empresa, nas configurações do Instagram antes de conectar.

O Google pode mostrar o domínio **rnahumaf.workers.dev** na autorização: é o serviço que conclui a conexão sem expor o segredo do aplicativo. Se o acesso for negado, confira a conta escolhida e informe a mensagem ao responsável, sem enviar senhas ou códigos. Se o blog não aparecer, confirme que a conta escolhida tem acesso de autor ou administrador no Blogger.

Os executáveis ainda não têm assinatura de código; o pacote macOS também não é notarizado. Esta é uma versão Beta. Revise cada material e confirme o destino antes de publicar.

## Outros recursos

Para WordPress.com, use **Conectar WordPress.com**, autorize posts e mídia e confira o site escolhido. O fluxo foi validado no plano gratuito. WordPress com hospedagem própria usa a seção específica e senha de aplicativo.

Descreva o tema, o público e o objetivo da pauta. Em **Ferramentas de pesquisa**, escolha PubMed, web aberta ou ambos. Em **Briefing, canais e pesquisa**, você pode alterar essa seleção para a pauta. O pesquisador escolhe uma ferramenta permitida e registra a consulta e as fontes em **Fontes**. Novos workspaces oferecem as duas buscas; os antigos começam com PubMed. Web aberta usa OpenRouter/Exa e consome créditos da sua conta. Sem fontes reais, a geração para; a escrita manual e a reescrita não exigem busca externa.

Para gerar conteúdo com IA, informe sua chave OpenRouter no cofre e escolha os modelos. Não há opção pública de pesquisa demonstrativa. Materiais demonstrativos antigos continuam identificados e bloqueados para publicação. Ao abrir um workspace existente pela primeira vez nesta versão, informe a senha e mantenha **Lembrar neste computador** marcado. Nas próximas aberturas, o sistema operacional a recupera para desbloquear o cofre. Isso não adiciona uma chave OpenRouter que nunca foi salva. O aplicativo hospeda os JPEGs do Instagram temporariamente e remove as cópias depois que a Meta processa o carrossel. Se a conexão veio de uma versão anterior, reconecte o Instagram uma vez para ativar esse recurso.

Se o OpenRouter limitar uma chamada, o aplicativo tenta novamente após uma espera curta e pode usar outro provedor do mesmo modelo. O modelo selecionado não muda. Se o limite persistir, aguarde um minuto e confira os limites da chave e o saldo da conta OpenRouter.

Durante a produção, **Ver atividade dos agentes** mostra a etapa atual, as ferramentas chamadas e os resultados já salvos. Se uma etapa falhar, a execução fica em **Aguardando nova tentativa**. Abra o painel, escreva uma orientação opcional e escolha **Retomar com orientação**, ou use **Tentar novamente** sem acrescentar texto. A retomada conserva a consulta, as fontes e os textos concluídos. Uma resposta de carrossel que exceda os limites é corrigida automaticamente; se a estrutura estiver completa, a retomada também pode dividir a resposta já salva em mais cards sem perder conteúdo. Workspaces criados nas versões alfa são convertidos automaticamente quando possível.

Os cards são renderizados em JPEG 1080 × 1350. O template ajusta a tipografia quando um texto válido ocupa mais linhas, preservando margens e rodapé. Novas gerações recebem a orientação de distribuir textos extensos em mais cards.

**Bloquear e esquecer neste computador** fecha o cofre e apaga a lembrança local da senha. **Desconectar** remove a autorização deste workspace. Para invalidar também cópias anteriores, revogue o aplicativo nas configurações do provedor. Para transferir seu histórico, use **Copiar workspace**, abra a cópia no outro computador e use a mesma senha-mestra. A lembrança local não acompanha a cópia. Apenas um computador deve escrever nessa pasta por vez.

Cada pessoa deve criar seu próprio workspace. Não distribua sua pasta de trabalho nem seu cofre, pois eles podem conter textos, histórico e autorizações das suas contas.
