# Tempo Continuum

Site do Tempo Continuum: notícias, perfis de políticos, casos, documentários, dossiês, cursos com biblioteca e ferramentas de tecnologia cívica.

Endereço: https://tempocontinuum.github.io/tempocontinuum/

## Como lançar matérias

Pelo editor em https://tempocontinuum.github.io/tempocontinuum/admin/ (Sveltia CMS). O passo a passo está no guia da equipe "Como lançar matérias no Tempo Continuum".

Cada matéria salva no editor vira um pull request com o rótulo de status (Rascunho, Em revisão, Pronta). Ela só entra no site quando alguém a publica no editor.

## Onde fica cada coisa

- `*.html` e `js/runtime.js`: as páginas do site.
- `conteudo/noticias/*.json`: uma matéria por arquivo, gravada pelo editor.
- `conteudo/politicos/*.json`: uma ficha de político por arquivo, gravada pelo editor. A página `ficha.html?id=<arquivo>` monta a ficha.
- `dados/noticias.json` e `dados/politicos.json`: índices gerados por `scripts/gerar-indice.py`. A Home e a página Notícias leem o primeiro; a página Políticos, o segundo.
- `imagens/materias/` e `imagens/politicos/`: fotos enviadas pelo editor.
- `admin/`: o editor de matérias e fichas e a sua configuração (`config.yml`).
- `.github/workflows/publicar-site.yml`: gera os índices e publica o site a cada mudança no `main`.

## Como lançar ou editar fichas de políticos

No editor, abra **Políticos** e crie uma ficha nova ou edite uma existente. Como as matérias, cada ficha vira um pull request e só entra no site quando é publicada. Toda informação precisa estar nas fontes da ficha. O link "Ver histórico de edições" de cada ficha mostra todas as mudanças feitas nela.

## Testar no computador

```
python3 scripts/gerar-indice.py
python3 -m http.server 8000
```

Depois abra http://localhost:8000.
