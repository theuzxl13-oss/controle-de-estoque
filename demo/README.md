# Demonstração navegável — revenda de gás e água (GitHub Pages)

Versão estática do ERP adaptada para **revenda de gás (GLP) e água mineral**,
com **dados fictícios**: venda rápida (troca × completo), busca do cliente pelo
telefone, painel de entregas, estoque de cheios e vazios, cargas da
distribuidora com devolução de vazios e lembretes de recompra. É uma versão estática das telas, para visualizar o
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
