# Conectar uma conta profissional do Instagram

Procedimento de operação da beta. O aplicativo usa **Instagram Login**, não Facebook Login para acessar a API Instagram. O cadastro de desenvolvedor, porém, pode pedir autenticação da conta Facebook que administra o aplicativo Meta.

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
3. Em **Meus apps**, escolha **Criar aplicativo**. Informe nome e email de contato. A distribuição usa o nome **Social Media Agent**.
4. Em **Casos de uso**, selecione **Gerenciamento de conteúdo** e **Gerenciar mensagens e conteúdo no Instagram**. A categoria reúne vários recursos; isso não significa que seja necessário autorizar mensagens diretas ou comentários para publicar conteúdo.
5. Vincule o aplicativo a um portfólio empresarial verificado quando solicitar acesso às contas de terceiros.
6. Confira **Requisitos** e **Visão geral**. A criação pede aceite dos Termos da Plataforma e das Políticas do Desenvolvedor. O responsável deve autorizar esse aceite.
7. Clique em **Criar aplicativo**. Se a Meta pedir para redigitar a senha, faça isso diretamente no diálogo oficial; não compartilhe senha ou códigos em chat, logs ou arquivos do projeto.

## Estado da validação

Cadastro, callback, segredo e páginas públicas foram configurados. O fluxo OAuth real pelo Cloudflare obteve token de longa duração e a consulta autenticada confirmou @rnaf.me. Em 13/09/2026, o nome, domínio, política de privacidade, termos, exclusão de dados e categoria foram preparados no portal Meta. Um carrossel real de quatro cards foi publicado, recebeu media ID e teve as cópias temporárias removidas. A chamada obrigatória pode levar até 24 horas para aparecer no formulário. O acesso a contas sem função no aplicativo depende da verificação empresarial e da análise de acesso da Meta.

Não confunda aplicativo criado, conta autorizada, token válido e publicação bem-sucedida. Cada etapa precisa de uma confirmação própria. O teste de conexão não deve publicar conteúdo.

## Dados e replicação

Não copie tokens, senhas, emails pessoais ou identificadores de contas reais para exemplos deste documento. Cada usuário autoriza sua própria conta e usa o cofre local. O fluxo OAuth está implantado e validado com uma conta profissional. Distribuição ampla depende da publicação e da análise de acesso da Meta.

## Histórico de homologação com uma conta própria

No painel Meta, **Funções do app → Adicionar pessoas → Testador do Instagram**, digite o nome sem @ e aguarde a busca. Selecione o resultado exato da conta antes de clicar em Adicionar. Um chip contendo apenas o texto digitado não comprova que o identificador foi resolvido; no teste, isso fez a submissão retornar sem concluir. A confirmação é a linha da conta com status **Pendente** na lista de testadores.

Na própria conta Instagram, abra **Configurações → Permissões do site → Apps e sites → Convites do testador**. O convite do aplicativo deve aparecer. O responsável aceita os termos apresentados. Só então iniciar o fluxo OAuth do desktop. Sem esse vínculo, a Meta retornou “Função de desenvolvedor é insuficiente”. Estas etapas são de homologação do mantenedor e não compõem o login normal de usuários após aprovação do aplicativo.
