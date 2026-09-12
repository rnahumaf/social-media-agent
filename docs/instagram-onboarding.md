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

Cadastro e criação do aplicativo foram concluídos. As permissões básicas e de publicação estão prontas para teste no painel. Conexão da conta, geração do token e consulta autenticada ainda não foram validadas; estes passos serão registrados após confirmação no portal e na API.

Não confunda aplicativo criado, conta autorizada, token válido e publicação bem-sucedida. Cada etapa precisa de uma confirmação própria. O teste de conexão não deve publicar conteúdo.

## Dados e replicação

Não copie tokens, senhas, emails pessoais ou identificadores de contas reais para exemplos deste documento. Cada usuário autoriza sua própria conta e usa o cofre local. O fluxo OAuth está implementado, mas ainda precisa de implantação HTTPS e validação real. Distribuição ampla depende também dos requisitos de acesso avançado e análise da Meta.
