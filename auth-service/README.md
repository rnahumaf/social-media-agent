# Serviço de conexão Instagram (alfa)

Este componente é operado pelo responsável pelo Social Media Agent. O usuário final apenas desbloqueia seu cofre, clica em **Conectar Instagram** e autoriza a conta profissional no navegador. Ele não precisa criar aplicativo Meta, copiar token ou informar um ID numérico.

## Cloudflare usado neste alfa

O Worker `social-media-agent-auth-alpha` está publicado em `https://social-media-agent-auth-alpha.rnahumaf.workers.dev`. A configuração está em `wrangler.jsonc`; publique com `npx wrangler deploy --config auth-service/wrangler.jsonc`. O segredo `INSTAGRAM_APP_SECRET` deve ser cadastrado como Secret no Cloudflare. Logs de observabilidade estão desabilitados.

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

O Worker foi implantado e o endpoint de saúde respondeu. O cadastro do segredo e a autorização de uma conta real ainda estão pendentes. Testes locais com fixtures não comprovam aprovação da Meta nem conexão com uma conta real. Antes de distribuir: validar callback HTTPS real, consentimento com as duas permissões, identidade retornada, reinício e transferência do cofre e cancelamento no navegador.

Referência: [Login de Empresa no Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).
