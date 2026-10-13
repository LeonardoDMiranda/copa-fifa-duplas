// Tela "Classificação": ao vivo ou após uma semana, com a ordem manual dos empates técnicos.

(function () {
  "use strict";

  const { el, formatarSaldo, botaoIcone } = Util;
  const { VAGAS_FASE_FINAL } = Regras;

  function criar(app, raiz) {
    const { estado, nomePorId, renderizar } = app;

    const rotulo = el("span", { id: "rotulo-classificacao", class: "contador" });
    const controle = el("div", { id: "controle-classificacao" });
    const corpo = el("tbody", { id: "corpo-classificacao" });
    // [texto, por extenso (abreviação) ou texto só para o leitor (coluna sem título), classe]
    const colunas = [
      ["Pos", "Posição", "col-pos"], ["", "Variação", "col-var"], ["Jogador", null, "col-jogador"],
      ["Pts", "Pontos"], ["V", "Vitórias"], ["E", "Empates"], ["D", "Derrotas"],
      ["GP", "Gols pró"], ["GC", "Gols contra"], ["SG", "Saldo de gols"], ["Jogos", "Jogos disputados"],
    ];
    const cabecalho = ([texto, extenso, classe]) => el("th", { scope: "col", class: classe },
      !texto ? el("span", { class: "so-leitor" }, extenso)
        : extenso ? el("abbr", { title: extenso }, texto) : texto);
    raiz.append(el("section", { id: "tela-classificacao", class: "tela" },
      el("div", { class: "tela-cabecalho" },
        el("h2", {}, "Classificação ", rotulo),
        controle,
        el("p", { class: "legenda" },
          el("span", { class: "amostra-classificado" }),
          " Top 8 vai para a fase final · ▲▼ variação em relação à semana anterior · ",
          Icones.svg("empate"), " empate técnico: use ", Icones.svg("subir"), Icones.svg("descer"),
          " para definir a ordem (confronto direto ou sorteio)")),
      el("div", { class: "tabela-rolagem" },
        el("table", { class: "classificacao" },
          el("thead", {}, el("tr", {}, colunas.map(cabecalho))),
          corpo))));

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
      const explicacao = empate.ordemManual
        ? `Empate técnico (${nomes}). Ordem definida pelo organizador.`
        : `Empate técnico (${nomes}). Ordem alfabética provisória: defina com as setas ou confirme a ordem atual.`;
      return el("td", { class: "col-jogador" },
        linha.nome,
        el("span", { class: "empate" + (empate.ordemManual ? "" : " provisorio"), title: explicacao },
          Icones.svg("empate"), el("span", { class: "so-leitor" }, explicacao)),
        editavel && el("span", { class: "controle-desempate" },
          botaoIcone({
            icone: "subir", rotulo: `Subir ${linha.nome} no desempate`, id: `desempate-${linha.id}-sobe`, class: "mini",
            disabled: i === 0, onclick: () => moverNoDesempate(empate.grupo, linha.id, -1),
          }),
          botaoIcone({
            icone: "descer", rotulo: `Descer ${linha.nome} no desempate`, id: `desempate-${linha.id}-desce`, class: "mini",
            disabled: i === ultimo, onclick: () => moverNoDesempate(empate.grupo, linha.id, 1),
          }),
          !empate.ordemManual && i === 0 && botaoIcone({
            icone: "confirmar", rotulo: "Confirmar a ordem atual deste empate", class: "mini confirmar",
            onclick: () => definirOrdemManual(empate.grupo),
          })));
    }

    function celulaVariacao(variacao) {
      const celula = (classe, seta, texto) => el("td", { class: `col-var ${classe}`, title: texto },
        el("span", { "aria-hidden": "true" }, seta), el("span", { class: "so-leitor" }, texto));
      if (variacao > 0) return celula("sobe", `▲${variacao}`, `Subiu ${variacao}`);
      if (variacao < 0) return celula("desce", `▼${-variacao}`, `Caiu ${-variacao}`);
      return el("td", { class: "col-var" });
    }

    function controleClassificacao(ultimaSemana) {
      if (!ultimaSemana) {
        controle.replaceChildren();
        return;
      }
      const opcoes = [el("option", { value: "", selected: semanaClassificacao === null }, "Atual (ao vivo)")];
      for (let n = 1; n <= ultimaSemana; n++) {
        opcoes.push(el("option", { value: String(n), selected: semanaClassificacao === n }, `Após a semana ${n}`));
      }
      controle.replaceChildren(el("label", { class: "campo-config" }, "Ver classificação",
        el("select", {
          id: "select-semana-classificacao",
          onchange: (ev) => { semanaClassificacao = ev.target.value === "" ? null : Number(ev.target.value); renderizar(); },
        }, opcoes)));
    }

    function renderizarTabela(tabela, editavel) {
      if (!tabela.length) {
        corpo.replaceChildren(el("tr", {}, el("td", { colspan: String(colunas.length), class: "celula-vazia" },
          app.proximoPasso("Nenhum jogador cadastrado ainda.", "jogadores", "Ir para Jogadores"))));
        return;
      }
      corpo.replaceChildren(
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
      rotulo.textContent = semanaClassificacao === null ? "" : `após a semana ${semanaClassificacao}`;
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
