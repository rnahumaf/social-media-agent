# Como contribuir

O Social Media Agent está em beta. Abra uma issue para relatar falhas reproduzíveis ou propor mudanças de comportamento. Não inclua senhas, tokens, workspaces reais, textos privados nem capturas com dados pessoais.

Para preparar o ambiente, use Node.js 22 ou superior:

```bash
npm ci
npm test
npm run build
```

Mudanças no cofre, na persistência, na aprovação ou na publicação precisam cobrir o cenário de falha correspondente. Mudanças visuais devem ser verificadas na prévia e no aplicativo desktop. Preserve a portabilidade do workspace e mantenha credenciais fora do renderer e do histórico editorial.

Ao enviar um pull request, descreva o problema, o comportamento resultante e os comandos de validação executados.
