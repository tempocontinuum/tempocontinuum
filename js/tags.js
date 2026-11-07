/* Tags com subtags do Tempo Continuum.
 *
 * Uma tag pode ter uma subtag, separada por barra: "violência/contra indígenas".
 * - No site ela aparece como "violência › contra indígenas".
 * - Filtrar pela tag-mãe ("violência") traz todas as matérias dela, com ou sem subtag.
 * - Filtrar pela subtag traz só as matérias daquele recorte.
 * Tags sem barra funcionam como antes.
 */
(function () {
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // "Violência / Contra indígenas " -> { pai: "Violência", filho: "Contra indígenas" }
  function partes(tag) {
    var s = String(tag || '').trim();
    var i = s.indexOf('/');
    if (i < 0) return { pai: s, filho: '' };
    return { pai: s.slice(0, i).trim(), filho: s.slice(i + 1).trim() };
  }

  // Forma única da tag, sem espaços sobrando em volta da barra.
  function canon(tag) {
    var p = partes(tag);
    if (!p.pai) return p.filho;
    return p.filho ? p.pai + '/' + p.filho : p.pai;
  }

  function rotulo(tag) {
    var p = partes(tag);
    if (!p.pai) return p.filho;
    return p.filho ? p.pai + ' › ' + p.filho : p.pai;
  }

  // Chaves de busca de uma lista de tags: cada tag-mãe e cada tag completa.
  function chaves(tags) {
    var out = [];
    (tags || []).forEach(function (t) {
      var c = canon(t);
      if (!c) return;
      var p = partes(c);
      [norm(p.pai), norm(c)].forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
    });
    return out;
  }

  // A matéria passa se tiver todas as tags selecionadas (mãe ou subtag).
  function passa(tags, selecionadas) {
    var ks = chaves(tags);
    return (selecionadas || []).every(function (s) { return ks.indexOf(norm(canon(s))) >= 0; });
  }

  // Lista de tags para os botões de filtro, com quantas matérias têm cada uma.
  // As subtags vêm logo depois da tag-mãe.
  function contar(listaDeTags) {
    var grupos = {};
    listaDeTags.forEach(function (tags) {
      var vistos = {};
      (tags || []).forEach(function (t) {
        var c = canon(t);
        if (!c) return;
        var p = partes(c);
        var kp = norm(p.pai);
        var g = grupos[kp] || (grupos[kp] = { nome: p.pai, n: 0, filhos: {} });
        if (!vistos[kp]) { g.n++; vistos[kp] = true; }
        if (p.filho) {
          var kf = norm(c);
          var f = g.filhos[kf] || (g.filhos[kf] = { nome: c, n: 0 });
          if (!vistos[kf]) { f.n++; vistos[kf] = true; }
        }
      });
    });
    var porConta = function (a, b) { return b.n - a.n || a.nome.localeCompare(b.nome, 'pt'); };
    var out = [];
    Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(porConta).forEach(function (g) {
      out.push({ tag: g.nome, rotulo: g.nome, n: g.n, sub: false });
      Object.keys(g.filhos).map(function (k) { return g.filhos[k]; }).sort(porConta).forEach(function (f) {
        out.push({ tag: f.nome, rotulo: rotulo(f.nome), n: f.n, sub: true });
      });
    });
    return out;
  }

  window.TCTags = { norm: norm, partes: partes, canon: canon, rotulo: rotulo, chaves: chaves, passa: passa, contar: contar };
})();
