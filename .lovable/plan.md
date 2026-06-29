## Problema
O script `scripts/build-capacitor-spa.mjs` importa o pacote `esbuild`, mas ele não está declarado nas dependências do projeto. Por isso `npm run mobile:android` quebra com `ERR_MODULE_NOT_FOUND`.

## Solução
Adicionar `esbuild` como `devDependency` no `package.json` e reinstalar dependências.

## Passos
1. Incluir `"esbuild": "^0.25.0"` (ou versão compatível) em `devDependencies`.
2. Rodar `npm install` para baixar o pacote.
3. Reexecutar `npm run mobile:android` para validar que o build mobile e o sync do Android prosseguem.

Isso não altera código da aplicação; é apenas uma dependência de build ausente.