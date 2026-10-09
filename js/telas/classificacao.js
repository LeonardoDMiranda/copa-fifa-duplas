// Tela "Classificação": ao vivo ou após uma semana, com a ordem manual dos empates técnicos.

(function () {
  "use strict";

  const { el, formatarSaldo } = Util;
  const { VAGAS_FASE_FINAL } = Regras;

  function criar(app) {
    const { estado, nomePorId, renderizar } = app;

    // Semana escolhida para ver a classificação (null = ao vivo). Só leitura quando não é ao vivo.
    let semanaClassificacao = null;

    function definirOrdemManual(ordem) {
      const nomes = ordem.map((x) => nomePorId.get(x)).join(" > ");
      estado.modificar(`desempate manual: ${nomes}`, (s) => {
        s.desempatesManuais = Regras.definirOrdemDesempate(s.desempatesManuais, ordem);
      });
    }

    function moverNoDesempate(ordem, id, delta) {
      const nova = ordem.slice();
      const i = nova.indexOf(id), j = i + delta;
      [nova[i], nova[j]] = [nova[j], nova[i]];
      definirOrdemManual(nova);
    }

    function celulaJogador(linha, editavel) {
      const empate = linha.empateTecnico;
      if (!empate) return el("td", { class: "col-jogador" }, linha.nome);

      const nomes = empate.grupo.map((id) => nomePorId.get(id)).join(", ");
      const i = empate.grupo.indexOf(linha.id);
      const ultimo = empate.grupo.length - 1;
      return el("td", { class: "col-jogador" },
        linha.nome,
        el("span", {
          class: "empate" + (empate.ordemManual ? "" : " provisorio"),
          title: empate.ordemManual
            ? `Empate técnico (${nomes}). Ordem definida pelo organizador.`
            : `Empate técnico (${nomes}). Ordem alfabética provisória: defina com ↑↓ ou confirme com ✔.`,
        }, "⚖️"),
        editavel && el("span", { class: "controle-desempate" },
          el("button", {
            type: "button", id: `desempate-${linha.id}-sobe`, title: `Subir ${linha.nome} no desempate`,
            disabled: i === 0, onclick: () => moverNoDesempate(empate.grupo, linha.id, -1),
          }, "↑"),
          el("button", {
            type: "button", id: `desempate-${linha.id}-desce`, title: `Descer ${linha.nome} no desempate`,
            disabled: i === ultimo, onclick: () => moverNoDesempate(empate.grupo, linha.id, 1),
          }, "↓"),
          !empate.ordemManual && i === 0 && el("button", {
            type: "button", class: "confirmar", title: "Confirmar a ordem atual deste empate",
            onclick: () => definirOrdemManual(empate.grupo),
          }, "✔")));
    }

    function celulaVariacao(variacao) {
      if (variacao > 0) return el("td", { class: "col-var sobe", title: `Subiu ${variacao}` }, `▲${variacao}`);
      if (variacao < 0) return el("td", { class: "col-var desce", title: `Caiu ${-variacao}` }, `▼${-variacao}`);
      return el("td", { class: "col-var" });
    }

    function controleClassificacao(ultimaSemana) {
      const alvo = document.getElementById("controle-classificacao");
      if (!ultimaSemana) {
        alvo.replaceChildren();
        return;
      }
      const opcoes = [el("option", { value: "", selected: semanaClassificacao === null }, "Atual (ao vivo)")];
      for (let n = 1; n <= ultimaSemana; n++) {
        opcoes.push(el("option", { value: String(n), selected: semanaClassificacao === n }, `Após a semana ${n}`));
      }
      alvo.replaceChildren(el("label", { class: "campo-config" }, "Ver classificação",
        el("select", {
          id: "select-semana-classificacao",
          onchange: (ev) => { semanaClassificacao = ev.target.value === "" ? null : Number(ev.target.value); renderizar(); },
        }, opcoes)));
    }

    function renderizarTabela(tabela, editavel) {
      document.getElementById("corpo-classificacao").replaceChildren(
        ...tabela.map((linha) => {
          let classe = linha.posicao <= VAGAS_FASE_FINAL ? "classificado" : "";
          if (linha.posicao === VAGAS_FASE_FINAL) classe += " linha-corte";
          if (linha.empateTecnico) classe += " em-empate";
          return el("tr", { class: classe.trim() || null },
            el("td", { class: "col-pos" }, `${linha.posicao}º`),
            celulaVariacao(linha.variacao),
            celulaJogador(linha, editavel),
            el("td", { class: "col-pts" }, String(linha.pontos)),
            el("td", {}, String(linha.v)),
            el("td", {}, String(linha.e)),
            el("td", {}, String(linha.d)),
            el("td", {}, String(linha.gp)),
            el("td", {}, String(linha.gc)),
            el("td", {}, formatarSaldo(linha.sg)),
            el("td", {}, String(linha.jogos)));
        })
      );
    }

    // `tabela` é a classificação ao vivo; com uma semana escolhida, mostra a daquela semana.
    function renderizarClassificacao(atual, tabela) {
      const cfg = atual.campeonato.config;
      const ultimaSemana = Regras.ultimaSemanaComResultado(atual.jogos, cfg);
      if (semanaClassificacao !== null && (ultimaSemana === null || semanaClassificacao > ultimaSemana)) semanaClassificacao = null;
      const tabelaVista = semanaClassificacao === null
        ? tabela
        : Regras.classificacaoPorSemana(app.base(), atual.jogos, atual.desempatesManuais, cfg, semanaClassificacao);
      controleClassificacao(ultimaSemana);
      document.getElementById("rotulo-classificacao").textContent = semanaClassificacao === null ? "" : `após a semana ${semanaClassificacao}`;
      renderizarTabela(tabelaVista, semanaClassificacao === null);
    }

    return {
      renderizar: renderizarClassificacao,
      semanaVista: () => semanaClassificacao,
      reiniciarVisao() { semanaClassificacao = null; },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, classificacao: { criar } };
})();
