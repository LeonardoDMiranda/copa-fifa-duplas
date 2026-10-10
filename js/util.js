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

  // Janela com várias opções. Devolve uma Promise com o `valor` da opção escolhida, ou null
  // (Esc ou "Cancelar"). opcoes = [{ valor, rotulo, id?, classe? }], da esquerda para a direita;
  // `foco` = valor da opção que começa com o foco (padrão: a última). extras = [{ rotulo, id?,
  // aoClicar }]: botões à esquerda que fazem algo sem fechar a janela (ex.: exportar antes).
  function escolher(mensagem, { titulo, opcoes, foco = null, extras = [] }) {
    return new Promise((resolver) => {
      const dialogo = el("dialog", { class: "dialogo", "aria-labelledby": "dialogo-titulo" },
        el("form", { method: "dialog" },
          el("h2", { id: "dialogo-titulo" }, titulo),
          el("div", { class: "dialogo-texto" }, blocosDeTexto(mensagem)),
          el("div", { class: "dialogo-acoes" },
            extras.map((x) => el("button", { type: "button", id: x.id, class: "dialogo-extra", onclick: x.aoClicar }, x.rotulo)),
            el("button", { type: "submit", id: "dialogo-cancelar", value: "" }, "Cancelar"),
            opcoes.map((o) => el("button", { type: "submit", id: o.id, value: o.valor, class: o.classe || null }, o.rotulo)))));
      dialogo.addEventListener("close", () => {
        dialogo.remove();
        resolver(opcoes.some((o) => o.valor === dialogo.returnValue) ? dialogo.returnValue : null);
      });
      document.body.appendChild(dialogo);
      dialogo.showModal();
      const inicial = foco === "" ? "" : foco ?? opcoes[opcoes.length - 1].valor;
      dialogo.querySelector(`button[type="submit"][value="${inicial}"]`).focus();
    });
  }

  // Janela de confirmação no lugar do confirm() do navegador. Devolve uma Promise<boolean>.
  // Esc ou "Cancelar" = false. Em ações perigosas o botão de ação fica vermelho e o foco
  // começa em "Cancelar", para Enter não confirmar sem querer.
  async function confirmar(mensagem, { titulo = "Confirmar?", acao = "Confirmar", perigo = false, extras = [] } = {}) {
    const escolha = await escolher(mensagem, {
      titulo,
      opcoes: [{ valor: "ok", id: "dialogo-ok", rotulo: acao, classe: perigo ? "perigo-forte" : "primario" }],
      foco: perigo ? "" : "ok",
      extras,
    });
    return escolha === "ok";
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

  // ---------- cor e logo do campeonato ----------

  // Contraste entre duas cores "#rrggbb", pela fórmula do WCAG (1 a 21).
  function contraste(cor1, cor2) {
    const luminancia = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [clara, escura] = [luminancia(cor1), luminancia(cor2)].sort((a, b) => b - a);
    return (clara + 0.05) / (escura + 0.05);
  }

  const CONTRASTE_MINIMO = 4.5; // texto normal (WCAG AA)

  // O cabeçalho, o telão e os PNGs escrevem em branco sobre a cor do campeonato.
  function corLegivelComBranco(cor) {
    return /^#[0-9a-fA-F]{6}$/.test(cor) && contraste(cor, "#ffffff") >= CONTRASTE_MINIMO;
  }

  function carregarImagem(src) {
    return new Promise((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rejeitar(new Error("não foi possível ler a imagem."));
      img.src = src;
    });
  }

  const LOGO_LARGURA = 256;
  const LOGO_ALTURA = 128;

  // Reduz a imagem escolhida para caber em 256×128 (sem aumentar) e devolve uma data URL (PNG ou,
  // se ficar grande, WebP), que fica guardada nos dados do campeonato. Lança Error se não der.
  async function prepararLogo(arquivo) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) throw new Error("use uma imagem PNG, JPG ou WebP.");
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await carregarImagem(url);
      const escala = Math.min(1, LOGO_LARGURA / img.naturalWidth, LOGO_ALTURA / img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const [tipo, qualidade] of [["image/png"], ["image/webp", 0.9], ["image/webp", 0.7]]) {
        const dados = canvas.toDataURL(tipo, qualidade);
        if (dados.startsWith(`data:${tipo};`) && dados.length <= Estado.MAX_CARACTERES_LOGO) return dados;
      }
      throw new Error("a imagem ficou grande demais mesmo reduzida; tente uma mais simples.");
    } finally {
      URL.revokeObjectURL(url);
    }
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

  globalThis.Util = {
    el, escolher, confirmar, MAX_GOLS, lerGols, formatarSaldo, dois, carimbo, slug, classeDoLado,
    contraste, CONTRASTE_MINIMO, corLegivelComBranco, carregarImagem, prepararLogo,
  };
})();
