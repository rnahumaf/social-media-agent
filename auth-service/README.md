# Serviço de conexão e publicação

Este componente é operado pelo responsável pelo Social Media Agent. O usuário final apenas desbloqueia seu cofre, clica em **Conectar Instagram** e autoriza a conta profissional no navegador. Ele não precisa criar aplicativo Meta, copiar token ou informar um ID numérico.

## Serviço Cloudflare da beta

O Worker `social-media-agent-auth-alpha` está publicado em `https://social-media-agent-auth-alpha.rnahumaf.workers.dev`. O identificador técnico foi preservado para não invalidar callbacks OAuth existentes; as páginas e o produto exibem a marca Beta. A configuração está em `wrangler.jsonc`; publique com `npx wrangler deploy --config auth-service/wrangler.jsonc`. O segredo `INSTAGRAM_APP_SECRET` deve ser cadastrado como Secret no Cloudflare. Logs de observabilidade estão desabilitados.

O Durable Object coordena as sessões e garante resgate único mesmo entre requisições concorrentes. As sessões e tokens permanecem apenas na memória, sem escrita no armazenamento durável. Uma reinicialização pode invalidar uma conexão em andamento; o usuário deve tentar novamente. Há limite de dez inícios por minuto por hash de IP e mil sessões simultâneas por instância. O endereço público já está embutido na configuração do desktop. O endpoint `/health` informa se o segredo foi cadastrado, sem revelá-lo.

## Alternativa em servidor Node

Execute uma única instância Node 22 atrás de um proxy HTTPS. As sessões ficam apenas na memória por até dez minutos; reiniciar o serviço exige reiniciar as conexões em andamento. Não há banco de dados de contas ou conteúdo editorial neste serviço.

Defina no gerenciador de segredos da hospedagem:

- `AUTH_ORIGIN`: origem pública HTTPS, sem caminho, por exemplo `https://auth.example.com`.
- `INSTAGRAM_APP_ID`: ID do aplicativo **Instagram**, que pode diferir do ID principal Meta.
- `INSTAGRAM_APP_SECRET`: segredo do aplicativo Instagram. Nunca incluir no desktop ou no Git.
- `PORT`: porta interna, padrão 8787.
- `AUTH_BIND`: padrão `127.0.0.1`; use `0.0.0.0` em contêiner com isolamento da rede.

Inicie com `node auth-service/server.cjs`, ou construa o Dockerfile a partir da raiz do repositório: `docker build -f auth-service/Dockerfile -t social-media-auth .`.

O proxy deve terminar TLS, limitar criação de sessões por IP, limitar corpo a 1 KiB e desabilitar logs de query strings, cabeçalhos Authorization e corpos de requisição/resposta. O callback contém um código de autorização. Não habilite captura de payloads no monitoramento. O limite global de mil sessões em memória é apenas proteção adicional, não substitui limite por origem. Não use múltiplas réplicas sem implementar armazenamento compartilhado com expiração e consumo atômico.

No painel Meta, configure o callback exato `https://SEU-DOMINIO/oauth/callback`. Solicite somente `instagram_business_basic` e `instagram_business_content_publish`. Configure as páginas reais de privacidade e exclusão de dados e cumpra as exigências de análise apresentadas pela Meta. Acesso padrão permite testar contas próprias adicionadas ao aplicativo; atender contas de terceiros requer Advanced Access e análise das permissões.

Depois da implantação, coloque a origem pública em `core/auth-config.json` e gere uma nova distribuição desktop. O arquivo contém somente endereço público. Para desenvolvimento, `STUDIO_AUTH_ORIGIN` substitui esse endereço. Nenhuma configuração de servidor é pedida ao usuário final.

## Segurança e limites

O desktop gera um segredo aleatório por conexão e envia apenas seu hash ao iniciar. O callback valida `state`; somente o desktop que possui o segredo pode resgatar o resultado. O resgate é único. Negação, cancelamento e expiração não substituem a conexão anterior. Este mecanismo protege a entrega entre serviço e desktop; não é suporte PKCE alegado para os endpoints Meta.

O serviço troca o código e obtém o token de longa duração. O desktop consulta a identidade diretamente na Meta antes de persistir o token no cofre AES-GCM. Senha Instagram e segredo do app não chegam ao renderer. O token passa temporariamente pelo serviço de autorização, mas não é gravado em disco. A chave derivada do cofre fica na memória do processo principal enquanto desbloqueado e é zerada ao bloquear ou fechar.

Nesta implementação, autorizações expiradas ou revogadas exigem reconexão; renovação automática ainda não foi implementada. Desconectar elimina o token apenas no workspace atual. Cópias anteriores devem ser removidas ou o acesso deve ser revogado nas configurações do Instagram.

O Worker foi implantado e o endpoint de saúde respondeu. Em 13/09/2026, o fluxo real de @rnaf.me validou callback, consentimento, consulta autenticada, hospedagem temporária dos quatro JPEGs, criação do carrossel, publicação e remoção das cópias temporárias. Isso comprova a integração com a conta de homologação, mas não substitui a aprovação de acesso da Meta para contas de terceiros.

Referência: [Login de Empresa no Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).

## WordPress.com

O mesmo Worker oferece `/wordpress/sessions` e `/wordpress/callback`. Configure `WORDPRESS_CLIENT_ID` como variável pública e `WORDPRESS_CLIENT_SECRET` como Secret. O consentimento solicita `posts media`, sem acesso global. Cada sessão é vinculada ao provedor; um callback ou resgate Instagram não pode consumir uma sessão WordPress. O desktop confirma o site pela API oficial e verifica o vínculo do token ao site, os escopos e a consulta autenticada de posts antes de guardar o token. O conector para hospedagem própria continua usando senha de aplicativo e endpoint `/wp-json/wp/v2`.

Os diagnósticos `node scripts/validate-instagram.cjs NOME` e `node scripts/validate-wordpress.cjs HOST_DO_SITE` exibem a URL de consentimento e somente o resultado resumido. Não salvam tokens. A implementação Node alternativa não oferece WordPress.com e não foi validada contra contas reais; use o Worker implantado nesta beta.

## Blogger

Configure `GOOGLE_CLIENT_ID` e o Secret `GOOGLE_CLIENT_SECRET` para um cliente web Google com callback HTTPS em `/blogger/callback`. Habilite a API Blogger, declare `https://www.googleapis.com/auth/blogger` em **Data Access** e deixe o aplicativo externo em **In production**. O Google classifica esse escopo como não sensível; não é necessário manter uma lista de testadores. As rotas `/blogger/sessions` usam a mesma entrega por verificador e consumo único. O serviço não grava tokens; o refresh token retorna ao cofre do desktop. `/blogger/refresh` recebe esse token em `Authorization`, usa o segredo do cliente apenas no servidor e retorna o token de acesso renovado, sem persistência.

O projeto usado pela distribuição pública está em produção desde 13/09/2026. Qualquer conta Google pode iniciar o consentimento e conectar os blogs que administra. A autorização real acontece no computador de cada pessoa; senhas e códigos não são enviados ao responsável pelo aplicativo.
