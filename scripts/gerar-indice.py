"""Gera os índices do site a partir dos arquivos gravados pelo editor.

- dados/noticias.json, com as matérias de conteudo/noticias/. A Home e a página
  Notícias leem este índice; o texto completo de cada matéria é lido do arquivo
  dela, na página materia.html.
- dados/politicos.json, com as fichas de conteudo/politicos/. A página Políticos
  lê este índice; a ficha completa é lida do arquivo dela, na página ficha.html.

Uso: python3 scripts/gerar-indice.py
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "conteudo" / "noticias"
SAIDA = RAIZ / "dados" / "noticias.json"
PASTA_POLITICOS = RAIZ / "conteudo" / "politicos"
SAIDA_POLITICOS = RAIZ / "dados" / "politicos.json"
CAMPOS_POLITICOS = ("nome", "iniciais", "foto", "categoria", "cargo_curto", "partido", "uf", "chamada")
CAMPOS = ("titulo", "linha", "data", "editoria", "tags", "autor", "foto", "destaque")


def caminho_relativo(foto):
    """O editor grava fotos como /imagens/...; o site precisa de imagens/... ."""
    foto = (foto or "").strip()
    if foto.startswith("http://") or foto.startswith("https://"):
        return foto
    return foto.lstrip("/").removeprefix("tempocontinuum/")


def main():
    materias, problemas = [], []
    for arquivo in sorted(PASTA.glob("*.json")):
        try:
            dados = json.loads(arquivo.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as erro:
            problemas.append(f"{arquivo.name}: arquivo inválido ({erro})")
            continue
        if not dados.get("titulo") or not dados.get("data"):
            problemas.append(f"{arquivo.name}: sem título ou sem data, ficou de fora")
            continue
        item = {"id": arquivo.stem}
        for campo in CAMPOS:
            item[campo] = dados.get(campo)
        item["tags"] = [str(t).strip() for t in (item["tags"] or []) if str(t).strip()]
        item["foto"] = caminho_relativo(item["foto"])
        item["destaque"] = bool(item["destaque"])
        materias.append(item)

    materias.sort(key=lambda m: str(m["data"]), reverse=True)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(materias, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"{len(materias)} matérias em {SAIDA.relative_to(RAIZ)}")
    problemas += gerar_politicos()
    for problema in problemas:
        print(f"Aviso: {problema}", file=sys.stderr)


def gerar_politicos():
    """Grava dados/politicos.json e devolve a lista de avisos."""
    fichas, problemas = [], []
    for arquivo in sorted(PASTA_POLITICOS.glob("*.json")):
        try:
            dados = json.loads(arquivo.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as erro:
            problemas.append(f"{arquivo.name}: arquivo inválido ({erro})")
            continue
        if not dados.get("nome"):
            problemas.append(f"{arquivo.name}: sem nome, ficou de fora")
            continue
        item = {"id": arquivo.stem}
        for campo in CAMPOS_POLITICOS:
            item[campo] = dados.get(campo) or ""
        item["foto"] = caminho_relativo(item["foto"])
        fichas.append(item)

    fichas.sort(key=lambda f: f["nome"].casefold())
    SAIDA_POLITICOS.write_text(json.dumps(fichas, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(fichas)} fichas em {SAIDA_POLITICOS.relative_to(RAIZ)}")
    return problemas


if __name__ == "__main__":
    main()
