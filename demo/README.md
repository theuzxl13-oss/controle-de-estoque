# Demonstração navegável (GitHub Pages)

Versão estática das telas do ERP com **dados fictícios**, para visualizar o
layout e a navegação. Não grava nada (recarregar restaura os dados) e não
emite notas fiscais. O sistema real é o app Next.js + Supabase da raiz.

Reaproveita do sistema real: cálculo de venda/troco/desconto
(`src/lib/domain`), matriz de permissões (`src/lib/auth`) e validação de
CPF/CNPJ (`src/lib/validation`).

```bash
cd demo
npm install
npm run dev      # http://localhost:5173/controle-de-estoque/
npm run build    # gera demo/dist
```

Publicação: o workflow `.github/workflows/pages.yml` gera o build e atualiza a
branch `gh-pages` a cada push na `main` que altere a demo.
