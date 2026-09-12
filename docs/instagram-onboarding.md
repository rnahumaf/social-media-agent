# Conectar uma conta profissional do Instagram

Procedimento do alfa, verificado parcialmente no portal Meta em 12/09/2026. O aplicativo usa **Instagram Login**, não Facebook Login para acessar a API Instagram. O cadastro de desenvolvedor, porém, pode pedir autenticação da conta Facebook que administra o aplicativo Meta.

## Configuração única do mantenedor

Estas etapas pertencem ao responsável por distribuir o aplicativo. Usuários finais seguem o fluxo **Conectar Instagram → autorizar na Meta → retornar ao desktop** e não criam um aplicativo de desenvolvedor. A implantação está descrita em [serviço de conexão](../auth-service/README.md).

## Pré-requisitos do mantenedor

- Conta Instagram profissional e acesso do responsável a ela.
- Conta Meta for Developers com telefone e email verificados.
- Aplicativo Meta configurado para API Instagram.
- Token autorizado para a conta e ID retornado pela API. O nome de usuário, sozinho, não autentica a integração.

## Cadastro e criação do aplicativo

1. Abra `https://developers.facebook.com/apps/` no navegador em que administra suas contas.
2. Se aparecer o cadastro de desenvolvedor, leia e aceite os termos, confirme telefone e email e informe a função que descreve seu uso. Para quem desenvolve esta integração, a opção é **Desenvolvedor**.
3. Em **Meus apps**, escolha **Criar aplicativo**. Informe nome e email de contato. O nome utilizado no teste foi **Social Media Agent Alpha**.
4. Em **Casos de uso**, selecione **Gerenciamento de conteúdo** e **Gerenciar mensagens e conteúdo no Instagram**. A categoria reúne vários recursos; isso não significa que seja necessário autorizar mensagens diretas ou comentários para publicar conteúdo.
5. Para este teste de uso próprio, foi selecionado **Ainda não quero me conectar a um portfólio empresarial**. O portal informou que é possível adicionar um portfólio depois. Distribuição a terceiros exige reavaliar os requisitos apresentados pela Meta.
6. Confira **Requisitos** e **Visão geral**. A criação pede aceite dos Termos da Plataforma e das Políticas do Desenvolvedor. O responsável deve autorizar esse aceite.
7. Clique em **Criar aplicativo**. Se a Meta pedir para redigitar a senha, faça isso diretamente no diálogo oficial; não compartilhe senha ou códigos em chat, logs ou arquivos do projeto.

## Estado da validação

Cadastro e criação do aplicativo foram concluídos. As permissões básicas e de publicação estão prontas para teste no painel. O segredo foi cadastrado como Secret no Cloudflare e `/health` confirmou a configuração. O convite de testador para a conta própria foi enviado e apareceu no Instagram. O convite foi aceito; o fluxo OAuth real pelo Cloudflare obteve token de longa duração e a consulta autenticada confirmou @rnaf.me em 12/09/2026. O diagnóstico descartou o token, sem gravá-lo no workspace nem publicar conteúdo. Para manter uma conexão no produto, o usuário abre o desktop, desbloqueia o cofre e usa Conectar Instagram.

Não confunda aplicativo criado, conta autorizada, token válido e publicação bem-sucedida. Cada etapa precisa de uma confirmação própria. O teste de conexão não deve publicar conteúdo.

## Dados e replicação

Não copie tokens, senhas, emails pessoais ou identificadores de contas reais para exemplos deste documento. Cada usuário autoriza sua própria conta e usa o cofre local. O fluxo OAuth está implementado, mas ainda precisa de implantação HTTPS e validação real. Distribuição ampla depende também dos requisitos de acesso avançado e análise da Meta.


## Vincular uma conta própria ao teste alfa

No painel Meta, **Funções do app → Adicionar pessoas → Testador do Instagram**, digite o nome sem @ e aguarde a busca. Selecione o resultado exato da conta antes de clicar em Adicionar. Um chip contendo apenas o texto digitado não comprova que o identificador foi resolvido; no teste, isso fez a submissão retornar sem concluir. A confirmação é a linha da conta com status **Pendente** na lista de testadores.

Na própria conta Instagram, abra **Configurações → Permissões do site → Apps e sites → Convites do testador**. O convite do aplicativo deve aparecer. O responsável aceita os termos apresentados. Só então iniciar o fluxo OAuth do desktop. Sem esse vínculo, a Meta retornou “Função de desenvolvedor é insuficiente”. Estas etapas são de homologação do mantenedor e não compõem o login normal de usuários após aprovação do aplicativo.
