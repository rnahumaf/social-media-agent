# Publicação da beta

O push na `main` executa testes de núcleo, build, auditoria de dependências e aceites desktop. Ele não publica uma versão.

Quando o código local estiver pronto e a publicação estiver autorizada:

1. Atualize `package.json` e `package-lock.json` com `npm version 0.1.0-beta.N --no-git-tag-version`. Faça commit das mudanças e push na `main`.
2. Acione uma única execução: `gh workflow run check.yml --ref main -f publish=true`. Também é possível usar **Actions → Beta checks and release → Run workflow**, escolher `main` e marcar **publish**.

A mesma execução repete os testes, cria os pacotes Windows, macOS Apple Silicon e macOS Intel, confirma nomes, formatos e versões, gera `SHA256SUMS.txt` e publica uma pré-release com notas automáticas. O job de publicação só começa se os três sistemas passarem. Não é necessário criar tag, rascunho, notas ou anexos manualmente. O resultado e eventual falha ficam no painel **Actions**.

Para testar todo o empacotamento sem publicar, use `gh workflow run check.yml --ref main -f publish=false`. Este é o valor padrão na interface. Se os testes ou pacotes falharem, corrija o código e execute novamente; não haverá nova versão pública. A versão do `package.json` deve ser inédita para publicar.

## Verificação macOS da beta.10 em diante

Prepare `docs/releases/<versao>.md` antes de acionar a release. O workflow inclui esse texto nas notas publicadas. Os pacotes usam electron-builder 26, `mac.identity: "-"` e os entitlements explícitos de `assets/entitlements.mac.plist`. Não exigem credencial Apple.

O gate executa `codesign --verify --deep --strict` no app gerado e no ZIP extraído, confere entitlements e todos os Mach-O, e abre o runtime final com dados sintéticos. O smoke de pacote usa uma porta de depuração local apenas durante o teste; não muda o comportamento de inicialização do produto. `spctl` é registrado separadamente: uma rejeição por ausência de notarização não equivale a assinatura inválida. Não desabilite Gatekeeper ou remova quarentena para aprovar a CI.
