// Parte final da aba "Ajustes" (index.html#campeonato, depois que o calendário é confirmado): a zona
// de perigo. As outras partes da aba (Configuração, Jogadores e o calendário) são as telas dos
// passos da preparação, mostradas juntas e já em modo só leitura.

(function () {
  "use strict";

  const { el } = Util;

  function criar(app, raiz) {
    raiz.append(el("section", { id: "tela-campeonato", class: "tela zona-perigo" },
      el("div", { class: "tela-cabecalho" }, el("h2", {}, "Zona de perigo")),
      el("p", { class: "legenda" },
        "Reiniciar apaga o campeonato inteiro (jogadores, calendário, placares, W.O., desempates manuais e mata-mata) e volta ao cadastro vazio. "
        + "Exporte um backup antes: no menu Campeonato do cabeçalho."),
      el("p", {},
        el("button", { type: "button", id: "btn-reiniciar", class: "perigo", onclick: app.resetar }, Icones.svg("resetar"), "Reiniciar campeonato"))));

    return { renderizar() {} };
  }

  globalThis.Telas = { ...globalThis.Telas, campeonato: { criar } };
})();
