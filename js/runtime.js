/* Tempo Continuum — motor mínimo para rodar as páginas do canvas fora do editor.
   Lê o <template id="tpl"> da página, preenche os {{campos}}, repete <sc-for>,
   mostra ou esconde <sc-if> e liga onClick/onChange às funções do componente. */
(function () {
  'use strict';

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, p || {});
    agendar();
  };
  DCLogic.prototype.forceUpdate = function () { agendar(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var UNICO = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function valor(scope, caminho) {
    caminho = caminho.trim();
    if (caminho === 'true') return true;
    if (caminho === 'false') return false;
    if (caminho === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(caminho)) return Number(caminho);
    if (/^(['"]).*\1$/.test(caminho)) return caminho.slice(1, -1);
    return caminho.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, scope);
  }
  function texto(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = valor(scope, p); return v == null ? '' : String(v); });
  }
  function bruto(str, scope) {
    var m = str.match(UNICO);
    return m ? valor(scope, m[1]) : texto(str, scope);
  }

  var EVENTOS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown', onblur: 'blur', onfocus: 'focus' };

  function montar(no, scope, destino) {
    if (no.nodeType === 3) { destino.appendChild(document.createTextNode(texto(no.nodeValue, scope))); return; }
    if (no.nodeType !== 1) return;
    var tag = no.localName;
    if (tag === 'sc-if') {
      if (bruto(no.getAttribute('value') || '', scope)) no.childNodes.forEach(function (f) { montar(f, scope, destino); });
      return;
    }
    if (tag === 'sc-for') {
      var lista = bruto(no.getAttribute('list') || '', scope) || [];
      var nome = no.getAttribute('as') || 'item';
      lista.forEach(function (item, i) {
        var s = Object.create(scope);
        s[nome] = item; s.$index = i;
        no.childNodes.forEach(function (f) { montar(f, s, destino); });
      });
      return;
    }
    var el = no.cloneNode(false);
    Array.prototype.slice.call(no.attributes).forEach(function (a) {
      var n = a.name.toLowerCase();
      if (n.indexOf('hint-') === 0) { el.removeAttribute(a.name); return; }
      if (EVENTOS[n]) {
        el.removeAttribute(a.name);
        var fn = bruto(a.value, scope);
        if (typeof fn === 'function') el.addEventListener(EVENTOS[n], fn);
        return;
      }
      if (a.value.indexOf('{{') >= 0) {
        var v = bruto(a.value, scope);
        if (v === false || v == null) el.removeAttribute(a.name);
        else if (n === 'value') { el.setAttribute(a.name, String(v)); el.value = String(v); }
        else el.setAttribute(a.name, String(v));
      }
    });
    var filhos = no.content ? no.content.childNodes : no.childNodes;
    filhos.forEach(function (f) { montar(f, scope, el); });
    destino.appendChild(el);
  }

  var comp, molde, raiz, pendente = false;
  function agendar() {
    if (pendente) return;
    pendente = true;
    Promise.resolve().then(function () { pendente = false; desenhar(); });
  }
  function desenhar() {
    var foco = document.activeElement, idFoco = foco && foco.id, ini = null, fim = null;
    try { if (idFoco && 'selectionStart' in foco) { ini = foco.selectionStart; fim = foco.selectionEnd; } } catch (e) {}
    var vals = comp.renderVals ? comp.renderVals() : {};
    var frag = document.createDocumentFragment();
    molde.content.childNodes.forEach(function (f) { montar(f, vals, frag); });
    raiz.replaceChildren(frag);
    if (idFoco) {
      var alvo = document.getElementById(idFoco);
      if (alvo && alvo !== document.body) {
        alvo.focus({ preventScroll: true });
        try { if (ini !== null) alvo.setSelectionRange(ini, fim); } catch (e) {}
      }
    }
  }

  window.iniciarPagina = function (Classe, props) {
    molde = document.getElementById('tpl');
    raiz = document.getElementById('app');
    comp = new Classe(props || {});
    if (!comp.state) comp.state = {};
    desenhar();
    if (comp.componentDidMount) comp.componentDidMount();
  };
})();
