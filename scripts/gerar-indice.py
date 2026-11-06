"""Gera dados/noticias.json a partir das matérias em conteudo/noticias/.

O editor (Sveltia CMS) grava cada matéria num arquivo próprio. O site lê só
este índice para montar a Home e a página Notícias; o texto completo de cada
matéria é lido do arquivo dela, na página materia.html.

Uso: python3 scripts/gerar-indice.py
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "conteudo" / "noticias"
SAIDA = RAIZ / "dados" / "noticias.json"
CAMPOS = ("titulo", "linha", "data", "editoria", "tags", "autor", "foto", "destaque", "ficticio")


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
        item["ficticio"] = bool(item["ficticio"])
        materias.append(item)

    materias.sort(key=lambda m: str(m["data"]), reverse=True)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(materias, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"{len(materias)} matérias em {SAIDA.relative_to(RAIZ)}")
    for problema in problemas:
        print(f"Aviso: {problema}", file=sys.stderr)


if __name__ == "__main__":
    main()
