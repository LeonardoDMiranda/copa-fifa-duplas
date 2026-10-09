// Utilitários de apresentação compartilhados por ui.js, js/telas/*.js, telao.js e exportar.js.
// Regras de negócio NÃO ficam aqui: elas ficam em regras.js.

(function () {
  "use strict";

  // Cria um elemento: props = atributos, "class", "dataset", propriedades (disabled, selected...)
  // e "onxxx" (eventos). Filhos nulos/false são ignorados e arrays são achatados.
  function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== "string") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...filhos.flat().filter((f) => f !== null && f !== undefined && f !== false));
    return e;
  }

  // Texto de uma mensagem em blocos: parágrafos separados por linha em branco; um bloco em que
  // todas as linhas começam com "- " vira lista.
  function blocosDeTexto(texto) {
    return String(texto).split(/\n\s*\n/).map((bloco) => {
      const linhas = bloco.split("\n").filter((l) => l.trim());
      if (linhas.length && linhas.every((l) => l.startsWith("- "))) {
        return el("ul", {}, linhas.map((l) => el("li", {}, l.slice(2))));
      }
      return el("p", {}, linhas.join(" "));
    });
  }

  // Janela de confirmação no lugar do confirm() do navegador. Devolve uma Promise<boolean>.
  // Esc ou "Cancelar" = false. Em ações perigosas o botão de ação fica vermelho e o foco
  // começa em "Cancelar", para Enter não confirmar sem querer.
  function confirmar(mensagem, { titulo = "Confirmar?", acao = "Confirmar", perigo = false } = {}) {
    return new Promise((resolver) => {
      const dialogo = el("dialog", { class: "dialogo", "aria-labelledby": "dialogo-titulo" },
        el("form", { method: "dialog" },
          el("h2", { id: "dialogo-titulo" }, titulo),
          el("div", { class: "dialogo-texto" }, blocosDeTexto(mensagem)),
          el("div", { class: "dialogo-acoes" },
            el("button", { type: "submit", id: "dialogo-cancelar", value: "cancelar" }, "Cancelar"),
            el("button", { type: "submit", id: "dialogo-ok", value: "ok", class: perigo ? "perigo-forte" : "primario" }, acao))));
      dialogo.addEventListener("close", () => {
        dialogo.remove();
        resolver(dialogo.returnValue === "ok");
      });
      document.body.appendChild(dialogo);
      dialogo.showModal();
      dialogo.querySelector(perigo ? "#dialogo-cancelar" : "#dialogo-ok").focus();
    });
  }

  const MAX_GOLS = 99;

  // Texto digitado num campo de placar: { vazio } | { invalido } | { valor }.
  function lerGols(texto) {
    const t = texto.trim();
    if (t === "") return { vazio: true };
    if (!/^\d+$/.test(t) || Number(t) > MAX_GOLS) return { invalido: true };
    return { valor: Number(t) };
  }

  function formatarSaldo(sg) {
    return sg > 0 ? `+${sg}` : String(sg);
  }

  function dois(n) {
    return String(n).padStart(2, "0");
  }

  // "Copa FIFA 2027 – Duplas" -> "copa-fifa-2027-duplas": para nomes de arquivo.
  function slug(texto) {
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campeonato";
  }

  // "2026-10-02-153045": usado nos nomes dos arquivos baixados.
  function carimbo(data) {
    return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
      + `-${dois(data.getHours())}${dois(data.getMinutes())}${dois(data.getSeconds())}`;
  }

  // Classe CSS (com espaço na frente) do lado de um jogo de classificação, conforme o resultado.
  function classeDoLado(resultado, lado) {
    if (resultado && resultado.tipo === "anulado") return " anulada";
    const ef = Regras.efeitosDoResultado(resultado);
    if (!ef) return "";
    if (ef[lado].v) return " vencedora";
    if (ef[lado].d) return " perdedora";
    return " empate";
  }

  globalThis.Util = { el, confirmar, MAX_GOLS, lerGols, formatarSaldo, dois, carimbo, slug, classeDoLado };
})();
