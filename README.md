# Tempo Continuum

Site do Tempo Continuum: notícias, perfis de políticos, casos, documentários, dossiês, cursos com biblioteca e ferramentas de tecnologia cívica.

Endereço: https://tempocontinuum.github.io/tempocontinuum/

## Como lançar matérias

Pelo editor em https://tempocontinuum.github.io/tempocontinuum/admin/ (Sveltia CMS). O passo a passo está no guia da equipe "Como lançar matérias no Tempo Continuum".

Cada matéria salva no editor vira um pull request com o rótulo de status (Rascunho, Em revisão, Pronta). Ela só entra no site quando alguém a publica no editor.

## Onde fica cada coisa

- `*.html` e `js/runtime.js`: as páginas do site.
- `conteudo/noticias/*.json`: uma matéria por arquivo, gravada pelo editor.
- `dados/noticias.json`: índice das matérias, gerado por `scripts/gerar-indice.py`. A Home e a página Notícias leem este arquivo.
- `imagens/materias/`: fotos enviadas pelo editor.
- `admin/`: o editor de matérias e a sua configuração (`config.yml`).
- `.github/workflows/publicar-site.yml`: gera o índice e publica o site a cada mudança no `main`.

## Testar no computador

```
python3 scripts/gerar-indice.py
python3 -m http.server 8000
```

Depois abra http://localhost:8000.
