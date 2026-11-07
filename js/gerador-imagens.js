/* Tempo Continuum — Gerador de imagens.
   Monta a imagem num <canvas>, direto no navegador de quem usa: nada é enviado ao site.
   Os formatos ficam em dados/layouts-imagens.json. O QR code usa js/vendor/qrcode-generator.js (MIT). */
(function () {
  'use strict';

  var FONTE = '"Gotham Medium", "Gotham", "GothamMedium", "Montserrat", Arial, sans-serif';
  var CHAVE = 'tc-gerador-imagens';
  var PISO_FONTE = 16;        // menor fonte permitida quando a pessoa fixa o número de linhas
  var MAX_LINHAS_OPCAO = 8;   // até quantas linhas o seletor oferece

  // =========================================================================
  // Utilidades de desenho
  // =========================================================================
  function rgba(hex, alpha) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (alpha == null ? 1 : alpha) + ')';
  }

  function caminhoRetangulo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fonte(fs) { return '500 ' + fs + 'px ' + FONTE; }

  function metricas(ctx) {
    var m = ctx.measureText('Hg');
    var fs = parseFloat(ctx.font.match(/(\d+(\.\d+)?)px/)[1]);
    var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    if (!(asc > 0)) { asc = fs * 0.8; desc = fs * 0.2; }
    return { asc: asc, desc: desc };
  }

  var FILTRO_OK = (function () {
    try {
      var t = document.createElement('canvas').getContext('2d');
      if (typeof t.filter !== 'string') return false;
      t.filter = 'blur(1px)';
      return t.filter === 'blur(1px)';
    } catch (e) { return false; }
  })();

  // Desfoca o que já está desenhado dentro da área (efeito "vidro")
  function desfocarRegiao(ctx, canvas, c, e) {
    var raio = c.desfoque * e, margem = Math.ceil(raio * 2);
    var x = c.x * e, y = c.y * e, w = c.largura * e, h = c.altura * e;
    var sx = Math.max(0, Math.floor(x - margem)), sy = Math.max(0, Math.floor(y - margem));
    var sw = Math.min(canvas.width, Math.ceil(x + w + margem)) - sx;
    var sh = Math.min(canvas.height, Math.ceil(y + h + margem)) - sy;
    if (sw <= 0 || sh <= 0) return;
    var copia = document.createElement('canvas');
    copia.width = sw; copia.height = sh;
    copia.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    caminhoRetangulo(ctx, x, y, w, h, (c.raio || 0) * e);
    ctx.clip();
    if (FILTRO_OK) {
      ctx.filter = 'blur(' + raio + 'px)';
      ctx.drawImage(copia, sx, sy);
    } else {
      // Navegadores sem filtro de canvas: reduz e amplia a imagem duas vezes
      var k = Math.max(2, raio / 2.5);
      var p = document.createElement('canvas');
      p.width = Math.max(1, Math.round(sw / k)); p.height = Math.max(1, Math.round(sh / k));
      var pc = p.getContext('2d');
      pc.imageSmoothingQuality = 'high';
      pc.drawImage(copia, 0, 0, p.width, p.height);
      pc.drawImage(p, 0, 0, p.width, p.height, 0, 0, p.width, p.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(p, 0, 0, p.width, p.height, sx, sy, sw, sh);
    }
    ctx.restore();
  }

  function gradiente(ctx, c) {
    var x = c.x, y = c.y, w = c.largura, h = c.altura, g;
    var dirs = { 'para baixo': 180, 'para cima': 0, 'para direita': 90, 'para esquerda': 270 };
    var ang = typeof c.direcao === 'number' ? c.direcao : (dirs[c.direcao] != null ? dirs[c.direcao] : 180);
    var rad = ang * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
    var meio = (Math.abs(w * dx) + Math.abs(h * dy)) / 2, cx = x + w / 2, cy = y + h / 2;
    g = ctx.createLinearGradient(cx - dx * meio, cy - dy * meio, cx + dx * meio, cy + dy * meio);
    g.addColorStop(0, rgba(c.cor, c.alpha == null ? 1 : c.alpha));
    g.addColorStop(1, rgba(c.cor2 || c.cor, c.alpha2 == null ? 0 : c.alpha2));
    return g;
  }

  // =========================================================================
  // Texto: quebra de linhas e ajuste à área
  // =========================================================================
  function quebrar(ctx, texto, largura) {
    var palavras = String(texto).trim().split(/\s+/).filter(Boolean), linhas = [], atual = '';
    for (var i = 0; i < palavras.length; i++) {
      var p = palavras[i];
      if (ctx.measureText(p).width > largura + 0.5) return null;   // palavra maior que a área
      var tentativa = atual ? atual + ' ' + p : p;
      if (!atual || ctx.measureText(tentativa).width <= largura + 0.5) atual = tentativa;
      else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  // Quebra forçada: corta palavras longas onde precisar
  function quebrarForcado(ctx, texto, largura) {
    var pedacos = [];
    String(texto).trim().split(/\s+/).filter(Boolean).forEach(function (p) {
      while (ctx.measureText(p).width > largura && p.length > 1) {
        var n = p.length - 1;
        while (n > 1 && ctx.measureText(p.slice(0, n)).width > largura) n--;
        pedacos.push(p.slice(0, n)); p = p.slice(n);
      }
      pedacos.push(p);
    });
    return quebrar(ctx, pedacos.join(' '), largura) || pedacos;
  }

  // paragrafos: lista de textos; devolve linhas [{t, p}] (p = índice do parágrafo)
  function ajustarTexto(ctx, paragrafos, a, op) {
    var W = a.largura, H = a.altura, lh = op.entrelinha || 1.1, maxL = op.maxLinhas || Infinity;
    function tentar(fs) {
      ctx.font = fonte(fs);
      var linhas = [];
      for (var i = 0; i < paragrafos.length; i++) {
        var l = quebrar(ctx, paragrafos[i], W);
        if (!l) return null;
        l.forEach(function (t) { linhas.push({ t: t, p: i }); });
      }
      if (linhas.length * fs * lh > H + 0.5 || linhas.length > maxL) return null;
      return linhas;
    }
    var lo = op.min, hi = op.max, melhor = null, linhas = null;
    if (tentar(hi)) { melhor = hi; }
    else {
      while (hi - lo > 0.25) {
        var meio = (lo + hi) / 2;
        if (tentar(meio)) { melhor = meio; lo = meio; } else hi = meio;
      }
      if (melhor === null && tentar(op.min)) melhor = op.min;
    }

    if (melhor !== null) {
      melhor = Math.floor(melhor * 4) / 4;
      linhas = tentar(melhor);
      // Equilibra as linhas (como text-wrap: balance): menor largura com o mesmo nº de linhas
      if (op.balancear && paragrafos.length === 1 && linhas.length > 1) {
        var n = linhas.length, a0 = W * 0.4, a1 = W;
        while (a1 - a0 > 1) {
          var m = (a0 + a1) / 2, l = quebrar(ctx, paragrafos[0], m);
          if (l && l.length <= n) a1 = m; else a0 = m;
        }
        var eq = quebrar(ctx, paragrafos[0], a1);
        if (eq && eq.length === n) linhas = eq.map(function (t) { return { t: t, p: 0 }; });
      }
      return { fonte: melhor, linhas: linhas, cortado: false, entrelinha: lh };
    }

    // Não coube nem no mínimo: quebra palavras e corta o final com "…"
    var fs = op.min;
    ctx.font = fonte(fs);
    var limite = Math.max(1, Math.min(maxL, Math.floor(H / (fs * lh))));
    var todas = [];
    paragrafos.forEach(function (p, i) { quebrarForcado(ctx, p, W).forEach(function (t) { todas.push({ t: t, p: i }); }); });
    var cortado = todas.length > limite;
    if (cortado) {
      todas = todas.slice(0, limite);
      var ult = todas[limite - 1], pal = ult.t.split(' ');
      while (pal.length > 1 && ctx.measureText(pal.join(' ') + '…').width > W) pal.pop();
      ult.t = pal.join(' ').replace(/[\s,.;:–—-]+$/, '') + '…';
    }
    return { fonte: fs, linhas: todas, cortado: cortado, quebrouPalavra: true, entrelinha: lh };
  }

  function desenharBloco(ctx, r, a, cores) {
    ctx.font = fonte(r.fonte);
    var m = metricas(ctx), alturaLinha = r.fonte * r.entrelinha, total = r.linhas.length * alturaLinha;
    var y0 = a.y;
    if (a.vertical === 'base') y0 = a.y + a.altura - total;
    else if (a.vertical === 'centro') y0 = a.y + (a.altura - total) / 2;
    ctx.textBaseline = 'alphabetic';
    r.linhas.forEach(function (l, i) {
      var w = ctx.measureText(l.t).width, x = a.x;
      if (a.alinhar === 'centro') x = a.x + (a.largura - w) / 2;
      else if (a.alinhar === 'direita') x = a.x + a.largura - w;
      var base = y0 + i * alturaLinha + alturaLinha / 2 + (m.asc - m.desc) / 2;
      ctx.fillStyle = cores[l.p] || cores[0];
      ctx.fillText(l.t, x, base);
    });
  }

  // =========================================================================
  // Elementos
  // =========================================================================
  function desenharSelo(ctx, s, texto) {
    texto = String(texto).toUpperCase();
    ctx.font = fonte(s.fonte);
    var esp = s.espaco_letras || 0, letras = Array.from(texto);
    var larguras = letras.map(function (ch) { return ctx.measureText(ch).width; });
    var w = larguras.reduce(function (a, b) { return a + b; }, 0) + esp * Math.max(0, letras.length - 1);
    ctx.fillStyle = rgba(s.cor_fundo, s.alpha_fundo);
    ctx.fillRect(s.x, s.y, w + 2 * s.margem, s.altura);
    var capa = ctx.measureText('H').actualBoundingBoxAscent || s.fonte * 0.7;
    var x = s.x + s.margem, base = s.y + s.altura / 2 + capa / 2;
    ctx.fillStyle = s.cor;
    ctx.textBaseline = 'alphabetic';
    letras.forEach(function (ch, i) { ctx.fillText(ch, x, base); x += larguras[i] + esp; });
  }

  function desenharLogos(ctx, a, imagens) {
    var prop = imagens.map(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      return w && h ? w / h : 3;
    });
    var h = a.altura, gaps = (imagens.length - 1) * a.espaco;
    var soma = prop.reduce(function (s, p) { return s + p * h; }, 0);
    if (soma + gaps > a.largura) h = h * (a.largura - gaps) / soma;
    var total = prop.reduce(function (s, p) { return s + p * h; }, 0) + gaps;
    var x = a.x;
    if (a.alinhar === 'direita') x = a.x + a.largura - total;
    else if (a.alinhar === 'centro') x = a.x + (a.largura - total) / 2;
    var y = a.y + (a.altura - h) / 2;
    imagens.forEach(function (img, i) {
      ctx.drawImage(img, x, y, prop[i] * h, h);
      x += prop[i] * h + a.espaco;
    });
  }

  function desenharQR(ctx, q, texto, e) {
    var codigo = qrcode(0, 'M');
    codigo.addData(texto, 'Byte');
    codigo.make();
    var n = codigo.getModuleCount();
    ctx.fillStyle = rgba(q.cor_fundo, q.alpha_fundo);
    caminhoRetangulo(ctx, q.x, q.y, q.tamanho, q.tamanho, q.raio || 0);
    ctx.fill();
    // Desenha em pixels inteiros do arquivo final para os módulos ficarem nítidos
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = q.cor;
    var x0 = (q.x + q.margem) * e, y0 = (q.y + q.margem) * e, lado = (q.tamanho - 2 * q.margem) * e;
    var pos = function (i, base) { return Math.round(base + i * lado / n); };
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (codigo.isDark(r, c)) {
          var xa = pos(c, x0), ya = pos(r, y0);
          ctx.fillRect(xa, ya, pos(c + 1, x0) - xa, pos(r + 1, y0) - ya);
        }
      }
    }
    ctx.restore();
  }

  function desenharGuias(ctx, L) {
    var areas = [['titulo', L.titulo], ['rodape', L.rodape], ['logos', L.logos],
      ['qr', L.qr && { x: L.qr.x, y: L.qr.y, largura: L.qr.tamanho, altura: L.qr.tamanho }]];
    var esc = L.largura / 1080;
    ctx.save();
    areas.forEach(function (par) {
      var a = par[1];
      if (!a) return;
      ctx.fillStyle = 'rgba(255,43,214,0.08)';
      ctx.fillRect(a.x, a.y, a.largura, a.altura);
      ctx.setLineDash([10 * esc, 6 * esc]);
      ctx.lineWidth = 2 * esc;
      ctx.strokeStyle = '#ff2bd6';
      ctx.strokeRect(a.x + 1, a.y + 1, a.largura - 2, a.altura - 2);
      ctx.font = '600 ' + 16 * esc + 'px Arial, sans-serif';
      var w = ctx.measureText(par[0]).width + 12 * esc;
      ctx.fillStyle = '#ff2bd6';
      ctx.fillRect(a.x, a.y - 24 * esc, w, 22 * esc);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(par[0], a.x + 6 * esc, a.y - 13 * esc);
    });
    ctx.restore();
  }

  // =========================================================================
  // Montagem completa
  // D = { titulo, selo, rodape: [..], link, fundo: Image|null, focoX, focoY, logos: [Image] }
  // =========================================================================
  function renderizar(canvas, L, D, op) {
    op = op || {};
    var e = op.escala || 1, rel = { avisos: [] };
    canvas.width = Math.round(L.largura * e);
    canvas.height = Math.round(L.altura * e);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(e, 0, 0, e, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    // 1. Fundo
    ctx.fillStyle = L.cor_fundo || '#000';
    ctx.fillRect(0, 0, L.largura, L.altura);
    if (D.fundo) {
      var iw = D.fundo.naturalWidth || D.fundo.width, ih = D.fundo.naturalHeight || D.fundo.height;
      var s = Math.max(L.largura / iw, L.altura / ih), dw = iw * s, dh = ih * s;
      ctx.drawImage(D.fundo, (L.largura - dw) * (D.focoX / 100), (L.altura - dh) * (D.focoY / 100), dw, dh);
    }

    // 2. Camadas com transparência
    (L.camadas || []).forEach(function (c) {
      if (c.desfoque) desfocarRegiao(ctx, canvas, c, e);
      ctx.save();
      if (c.mistura) ctx.globalCompositeOperation = c.mistura;
      ctx.fillStyle = c.tipo === 'gradiente' ? gradiente(ctx, c) : rgba(c.cor, c.alpha);
      caminhoRetangulo(ctx, c.x, c.y, c.largura, c.altura, c.raio || 0);
      ctx.fill();
      ctx.restore();
    });

    // 3. Selo, logos e QR
    if (L.selo && D.selo && D.selo.trim()) desenharSelo(ctx, L.selo, D.selo.trim());
    if (L.logos && D.logos && D.logos.length) desenharLogos(ctx, L.logos, D.logos);
    if (L.qr && D.link && D.link.trim()) {
      try { desenharQR(ctx, L.qr, D.link.trim(), e); }
      catch (err) { rel.avisos.push('o link é longo demais para o QR code'); }
    }

    // 4. Título e rodapé
    if (L.titulo && D.titulo && D.titulo.trim()) {
      var t = L.titulo;
      // Se a pessoa escolheu o número de linhas, a fonte pode descer abaixo do mínimo do formato
      var linhasEscolhidas = +D.linhasTitulo || 0;
      var minimo = linhasEscolhidas ? Math.min(t.fonte_min, PISO_FONTE) : t.fonte_min;
      var r = ajustarTexto(ctx, [D.titulo.trim()], t, {
        max: t.fonte_max, min: minimo, entrelinha: t.entrelinha,
        maxLinhas: linhasEscolhidas || t.max_linhas, balancear: true
      });
      desenharBloco(ctx, r, t, [t.cor]);
      rel.titulo = { fonte: r.fonte, linhas: r.linhas.length, cortado: r.cortado, limite: linhasEscolhidas || t.max_linhas };
      if (r.cortado) rel.avisos.push(linhasEscolhidas
        ? 'o título não coube em ' + linhasEscolhidas + (linhasEscolhidas === 1 ? ' linha' : ' linhas') + ' nem com a menor fonte; o final foi cortado com "…"'
        : 'o título não coube nem no tamanho mínimo; o final foi cortado com "…"');
      else if (r.fonte < t.fonte_min) rel.avisos.push('para caber em ' + linhasEscolhidas + (linhasEscolhidas === 1 ? ' linha' : ' linhas') + ', a fonte ficou menor que o recomendado para este formato (' + t.fonte_min + ' px)');
      else if (r.quebrouPalavra) rel.avisos.push('uma palavra do título é longa demais e foi quebrada');
    }
    var rod = (D.rodape || []).map(function (l) { return String(l || '').trim(); }).filter(Boolean);
    if (L.rodape && rod.length) {
      var a = L.rodape;
      var rr = ajustarTexto(ctx, rod, a, { max: a.fonte, min: Math.round(a.fonte * 0.6), entrelinha: a.entrelinha });
      var cores = rod.map(function (_, i) { return i === 0 && a.cor_destaque ? a.cor_destaque : a.cor; });
      desenharBloco(ctx, rr, a, cores);
      if (rr.cortado) rel.avisos.push('o rodapé não coube; o final foi cortado');
    }

    if (op.guias) desenharGuias(ctx, L);
    return rel;
  }

  function aplicarAjustes(L, ajustes) {
    var aj = (ajustes && ajustes[L.nome]) || {};
    var camadas = [];
    (L.camadas || []).forEach(function (c, i) {
      var a = aj[i] || {};
      if (a.visivel === false) return;
      var nova = Object.assign({}, c);
      if (a.alpha != null) nova.alpha = a.alpha;
      if (a.alpha2 != null) nova.alpha2 = a.alpha2;
      camadas.push(nova);
    });
    return Object.assign({}, L, { camadas: camadas });
  }

  window.GeradorImagens = { renderizar: renderizar, aplicarAjustes: aplicarAjustes };

  // =========================================================================
  // Interface da página
  // =========================================================================
  function iniciarInterface() {
    var raiz = document.getElementById('gerador');
    if (!raiz) return;
    if (typeof qrcode === 'function' && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    var $ = function (id) { return document.getElementById(id); };
    var LAYOUTS = [], porNome = {};
    var imagens = { fundo: null, fundoNome: '', logos: [] };   // ficam só na memória do navegador
    var estado = {
      layout: 'post-retrato', titulo: 'Escreva aqui o título: ele se ajusta sozinho à área demarcada',
      selo: '', rodape1: '', rodape2: '', link: '', nome: '',
      focoX: 50, focoY: 50, escala: 1, guias: false, ajustes: {}, linhas: 0
    };
    try { Object.assign(estado, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch (e) {}
    function guardar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} }

    function dados() {
      return {
        titulo: estado.titulo, linhasTitulo: estado.linhas, selo: estado.selo, rodape: [estado.rodape1, estado.rodape2],
        link: estado.link, fundo: imagens.fundo, focoX: estado.focoX, focoY: estado.focoY,
        logos: imagens.logos.map(function (l) { return l.img; })
      };
    }
    function layoutAtual() { return aplicarAjustes(porNome[estado.layout], estado.ajustes); }

    // ---- Prévia
    var previa = $('gr-previa'), quadro = $('gr-quadro'), agendado = false;
    function agendar() {
      guardar();
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(function () { agendado = false; desenharPrevia(); });
    }
    function desenharPrevia() {
      if (!LAYOUTS.length) return;
      var L = layoutAtual();
      var estreita = window.innerWidth < 860;
      var maxW = quadro.clientWidth - (estreita ? 0 : 40);
      var maxH = estreita ? Math.max(220, window.innerHeight * 0.42) : Math.max(320, Math.min(window.innerHeight * 0.75, 900));
      var disp = Math.min(maxW / L.largura, maxH / L.altura);
      previa.style.width = Math.floor(L.largura * disp) + 'px';
      previa.style.height = Math.floor(L.altura * disp) + 'px';
      var esc = Math.min(1, disp * (window.devicePixelRatio || 1));
      var rel = renderizar(previa, L, dados(), { escala: esc, guias: estado.guias });
      var ex = tamanhoExportado(L, 1);
      $('gr-medidas').textContent = 'Exporta em ' + ex.largura + ' × ' + ex.altura + ' px';
      relatorio(rel);
    }
    function relatorio(rel, extra) {
      var caixa = $('gr-relatorio');
      caixa.innerHTML = '';
      function add(t, cls) { var d = document.createElement('p'); d.textContent = t; if (cls) d.className = cls; caixa.appendChild(d); }
      if (rel && rel.titulo) add('Título em ' + Math.round(rel.titulo.fonte) + ' px, ' + rel.titulo.linhas + (rel.titulo.linhas === 1 ? ' linha' : ' linhas') + ' (máximo ' + rel.titulo.limite + ').');
      (rel && rel.avisos || []).forEach(function (a) { add('Atenção: ' + a + '.', 'gr-aviso'); });
      if (extra) add(extra.t, extra.cls);
    }
    window.addEventListener('resize', agendar);
    if (document.fonts) document.fonts.addEventListener('loadingdone', agendar);

    // ---- Campos de texto
    function ligar(id, chave) {
      var el = $(id);
      el.value = estado[chave] == null ? '' : estado[chave];
      el.addEventListener('input', function () { estado[chave] = el.value; if (id === 'gr-titulo') contar(); agendar(); });
    }
    function contar() { $('gr-contador').textContent = estado.titulo.length + ' caracteres'; }
    ligar('gr-titulo', 'titulo'); ligar('gr-selo', 'selo'); ligar('gr-rodape1', 'rodape1');
    ligar('gr-rodape2', 'rodape2'); ligar('gr-link', 'link'); ligar('gr-nome', 'nome');
    contar();

    $('gr-formato').addEventListener('change', function (ev) { estado.layout = ev.target.value; desenharCamadas(); opcoesLinhas(); opcoesEscala(); agendar(); });

    // ---- Número de linhas do título
    function opcoesLinhas() {
      var sel = $('gr-linhas'), L = porNome[estado.layout];
      sel.innerHTML = '';
      var auto = document.createElement('option');
      auto.value = '0';
      auto.textContent = 'Automático (até ' + L.titulo.max_linhas + ' neste formato)';
      sel.appendChild(auto);
      for (var n = 1; n <= MAX_LINHAS_OPCAO; n++) {
        var o = document.createElement('option');
        o.value = String(n);
        o.textContent = n === 1 ? '1 linha' : 'Até ' + n + ' linhas';
        sel.appendChild(o);
      }
      sel.value = String(estado.linhas || 0);
    }
    $('gr-linhas').addEventListener('change', function (ev) { estado.linhas = +ev.target.value; agendar(); });
    $('gr-guias').checked = !!estado.guias;
    $('gr-guias').addEventListener('change', function (ev) { estado.guias = ev.target.checked; agendar(); });
    // Tamanho do PNG baixado: o "exportar" do formato (se houver) vezes a resolução escolhida
    function tamanhoExportado(L, mult) {
      var base = L.exportar || { largura: L.largura, altura: L.altura };
      return { largura: Math.round(base.largura * mult), altura: Math.round(base.altura * mult), escala: base.largura / L.largura * mult };
    }
    function opcoesEscala() {
      var L = porNome[estado.layout], sel = $('gr-escala');
      [1, 2].forEach(function (m, i) {
        var t = tamanhoExportado(L, m);
        sel.options[i].textContent = (m === 1 ? 'Padrão' : '2× (mais nítida)') + ' · ' + t.largura + ' × ' + t.altura + ' px';
      });
    }
    $('gr-escala').value = String(estado.escala);
    $('gr-escala').addEventListener('change', function (ev) { estado.escala = +ev.target.value; guardar(); });

    // ---- Abrir imagens do computador
    function abrirImagem(arquivo) {
      return new Promise(function (ok, falha) {
        if (!arquivo || !/^image\//.test(arquivo.type)) return falha(new Error('escolha um arquivo de imagem'));
        var img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = function () { falha(new Error('não consegui abrir ' + arquivo.name)); };
        img.src = URL.createObjectURL(arquivo);
      });
    }

    // ---- Fundo
    function mostrarFundo() {
      var tem = !!imagens.fundo;
      $('gr-fundo-mini').hidden = !tem;
      $('gr-fundo-vazio').hidden = tem;
      if (tem) $('gr-fundo-mini').src = imagens.fundo.src;
      $('gr-fundo-nome').textContent = tem ? imagens.fundoNome : 'Clique ou arraste uma imagem';
      $('gr-remover-fundo').hidden = !tem;
    }
    function usarFundo(arq) {
      abrirImagem(arq).then(function (img) {
        imagens.fundo = img; imagens.fundoNome = arq.name; mostrarFundo(); agendar();
      }, function (e) { relatorio(null, { t: e.message, cls: 'gr-erro' }); });
    }
    var zona = $('gr-zona-fundo');
    zona.addEventListener('click', function () { $('gr-arquivo-fundo').click(); });
    zona.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('gr-arquivo-fundo').click(); } });
    $('gr-arquivo-fundo').addEventListener('change', function (ev) { if (ev.target.files[0]) usarFundo(ev.target.files[0]); ev.target.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.add('gr-arrastando'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.remove('gr-arrastando'); }); });
    zona.addEventListener('drop', function (ev) { if (ev.dataTransfer.files[0]) usarFundo(ev.dataTransfer.files[0]); });
    $('gr-remover-fundo').addEventListener('click', function () { imagens.fundo = null; mostrarFundo(); agendar(); });
    ['X', 'Y'].forEach(function (eixo) {
      var el = $('gr-foco' + eixo), saida = $('gr-foco' + eixo + '-v');
      el.value = estado['foco' + eixo];
      saida.textContent = el.value + '%';
      el.addEventListener('input', function () { estado['foco' + eixo] = +el.value; saida.textContent = el.value + '%'; agendar(); });
    });

    // ---- Logos
    function desenharLogos() {
      var lista = $('gr-logos');
      lista.innerHTML = '';
      if (!imagens.logos.length) { lista.innerHTML = '<p class="gr-dica">Nenhuma logo. Adicione as suas, se quiser.</p>'; return; }
      imagens.logos.forEach(function (l, i) {
        var item = document.createElement('div');
        item.className = 'gr-item';
        var mini = document.createElement('img'); mini.src = l.img.src; mini.alt = '';
        var nome = document.createElement('span'); nome.className = 'gr-item-nome'; nome.textContent = l.nome;
        var acoes = document.createElement('span'); acoes.className = 'gr-item-acoes';
        [['←', 'Mover para a esquerda', -1], ['→', 'Mover para a direita', 1], ['✕', 'Remover logo', 0]].forEach(function (b) {
          var bt = document.createElement('button');
          bt.type = 'button'; bt.textContent = b[0]; bt.setAttribute('aria-label', b[1] + ': ' + l.nome);
          bt.addEventListener('click', function () {
            var L = imagens.logos, j = i + b[2];
            if (b[2] === 0) L.splice(i, 1);
            else if (j >= 0 && j < L.length) { var t = L[i]; L[i] = L[j]; L[j] = t; }
            desenharLogos(); agendar();
          });
          acoes.appendChild(bt);
        });
        item.appendChild(mini); item.appendChild(nome); item.appendChild(acoes);
        lista.appendChild(item);
      });
    }
    $('gr-adicionar-logo').addEventListener('click', function () { $('gr-arquivo-logo').click(); });
    $('gr-arquivo-logo').addEventListener('change', function (ev) {
      var arquivos = Array.prototype.slice.call(ev.target.files);
      ev.target.value = '';
      Promise.all(arquivos.map(function (a) { return abrirImagem(a).then(function (img) { return { img: img, nome: a.name }; }); }))
        .then(function (novas) { imagens.logos = imagens.logos.concat(novas); desenharLogos(); agendar(); },
              function (e) { relatorio(null, { t: e.message, cls: 'gr-erro' }); });
    });

    // ---- Camadas
    var TIPOS = { cor: 'Cor', gradiente: 'Gradiente' };
    function desenharCamadas() {
      var L = porNome[estado.layout], aj = estado.ajustes[L.nome] || (estado.ajustes[L.nome] = {});
      var lista = $('gr-camadas');
      lista.innerHTML = '';
      L.camadas.forEach(function (c, i) {
        var a = aj[i] || {}, visivel = a.visivel !== false;
        var item = document.createElement('div');
        item.className = 'gr-camada' + (visivel ? '' : ' gr-oculta');
        var topo = document.createElement('label');
        topo.className = 'gr-camada-topo';
        var marca = document.createElement('input'); marca.type = 'checkbox'; marca.checked = visivel;
        var amostra = document.createElement('span'); amostra.className = 'gr-amostra';
        amostra.style.background = c.tipo === 'gradiente' ? 'linear-gradient(' + c.cor + ',' + (c.cor2 || c.cor) + ')' : c.cor;
        var nome = document.createElement('span');
        nome.textContent = (i + 1) + '. ' + (TIPOS[c.tipo] || c.tipo) + ' · ' + c.largura + '×' + c.altura + (c.desfoque ? ' · vidro' : '');
        topo.appendChild(marca); topo.appendChild(amostra); topo.appendChild(nome);
        item.appendChild(topo);
        marca.addEventListener('change', function () {
          aj[i] = aj[i] || {};
          if (marca.checked) delete aj[i].visivel; else aj[i].visivel = false;
          item.classList.toggle('gr-oculta', !marca.checked);
          agendar();
        });
        var campos = c.tipo === 'gradiente' ? [['alpha', 'Início'], ['alpha2', 'Fim']] : [['alpha', 'Opacidade']];
        campos.forEach(function (cp) {
          var v = a[cp[0]] != null ? a[cp[0]] : (c[cp[0]] != null ? c[cp[0]] : (cp[0] === 'alpha2' ? 0 : 1));
          var linha = document.createElement('label'); linha.className = 'gr-slider';
          var rot = document.createElement('span'); rot.textContent = cp[1];
          var r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.01; r.value = v;
          var out = document.createElement('span'); out.textContent = Math.round(v * 100) + '%';
          r.addEventListener('input', function () {
            (aj[i] = aj[i] || {})[cp[0]] = +r.value;
            out.textContent = Math.round(r.value * 100) + '%';
            agendar();
          });
          linha.appendChild(rot); linha.appendChild(r); linha.appendChild(out);
          item.appendChild(linha);
        });
        lista.appendChild(item);
      });
    }
    $('gr-restaurar').addEventListener('click', function () { estado.ajustes[estado.layout] = {}; desenharCamadas(); agendar(); });

    // ---- Baixar
    function nomeArquivo(L) {
      var base = (estado.nome || estado.titulo || 'imagem').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'imagem';
      var t = tamanhoExportado(L, estado.escala);
      return base + '-' + L.nome + '-' + t.largura + 'x' + t.altura + '.png';
    }
    function baixar(nomeLayout) {
      var L = aplicarAjustes(porNome[nomeLayout], estado.ajustes);
      var tela = document.createElement('canvas');
      var rel = renderizar(tela, L, dados(), { escala: tamanhoExportado(L, estado.escala).escala });
      return new Promise(function (ok, falha) {
        tela.toBlob(function (blob) {
          if (!blob) return falha(new Error('o navegador não conseguiu gerar o PNG'));
          var a = document.createElement('a'), nome = nomeArquivo(L);
          a.href = URL.createObjectURL(blob); a.download = nome;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          ok({ nome: nome, rel: rel });
        }, 'image/png');
      });
    }
    $('gr-baixar').addEventListener('click', function () {
      baixar(estado.layout).then(function (r) { relatorio(r.rel, { t: 'Baixado: ' + r.nome, cls: 'gr-ok' }); },
        function (e) { relatorio(null, { t: e.message, cls: 'gr-erro' }); });
    });
    $('gr-baixar-todos').addEventListener('click', function () {
      var nomes = [], cadeia = Promise.resolve();
      LAYOUTS.forEach(function (L) {
        cadeia = cadeia.then(function () { return baixar(L.nome); })
          .then(function (r) { nomes.push(r.nome); return new Promise(function (ok) { setTimeout(ok, 350); }); });
      });
      cadeia.then(function () { relatorio(null, { t: 'Baixados: ' + nomes.join(', '), cls: 'gr-ok' }); },
        function (e) { relatorio(null, { t: e.message, cls: 'gr-erro' }); });
    });
    $('gr-recomecar').addEventListener('click', function () {
      if (!confirm('Limpar todos os campos e voltar ao início?')) return;
      try { localStorage.removeItem(CHAVE); } catch (e) {}
      location.reload();
    });

    // ---- Início: carrega os formatos e a fonte
    fetch('dados/layouts-imagens.json').then(function (r) { return r.json(); }).then(function (j) {
      LAYOUTS = j.layouts;
      LAYOUTS.forEach(function (L) { porNome[L.nome] = L; });
      if (!porNome[estado.layout]) estado.layout = LAYOUTS[0].nome;
      $('gr-formato').innerHTML = '';
      LAYOUTS.forEach(function (L) {
        var o = document.createElement('option');
        var t = tamanhoExportado(L, 1);
        o.value = L.nome; o.textContent = L.rotulo + ' · ' + t.largura + '×' + t.altura;
        $('gr-formato').appendChild(o);
      });
      $('gr-formato').value = estado.layout;
      mostrarFundo(); desenharLogos(); desenharCamadas(); opcoesLinhas(); opcoesEscala();
      var fontes = document.fonts ? Promise.all([
        document.fonts.load('500 40px "Gotham Medium"'), document.fonts.load('500 40px Montserrat')
      ]).catch(function () {}) : Promise.resolve();
      return fontes.then(function () { agendar(); });
    }).catch(function (e) {
      relatorio(null, { t: 'Não consegui carregar os formatos (' + e.message + ').', cls: 'gr-erro' });
    });

    window.__gerador = { agendar: agendar };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarInterface);
  else iniciarInterface();
})();
