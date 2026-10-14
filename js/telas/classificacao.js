// Tela "Classificação": ao vivo ou após uma semana, com a ordem manual dos empates técnicos e, ao
// vivo, a coluna "Situação" (garantido, em disputa ou eliminado para o top 8). O nome abre a ficha.

(function () {
  "use strict";

  const { el, formatarSaldo, botaoIcone } = Util;
  const { VAGAS_FASE_FINAL } = Regras;

  function criar(app, raiz) {
    const { estado, nomePorId, renderizar } = app;

    const rotulo = el("span", { id: "rotulo-classificacao", class: "contador" });
    const controle = el("div", { id: "controle-classificacao" });
    const resumoSituacao = el("p", { id: "resumo-situacao", class: "legenda" });
    const cabecalhoTabela = el("thead", {});
    const corpo = el("tbody", { id: "corpo-classificacao" });
    // [texto, por extenso (abreviação) ou texto só para o leitor (coluna sem título), classe]
    const colunas = [
      ["Pos", "Posição", "col-pos"], ["", "Variação", "col-var"], ["Jogador", null, "col-jogador"],
      ["Pts", "Pontos"], ["V", "Vitórias"], ["E", "Empates"], ["D", "Derrotas"],
      ["GP", "Gols pró"], ["GC", "Gols contra"], ["SG", "Saldo de gols"], ["Jogos", "Jogos disputados"],
    ];
    const colunaSituacao = ["Situação", null, "col-situacao"];
    const cabecalho = ([texto, extenso, classe]) => el("th", { scope: "col", class: classe },
      !texto ? el("span", { class: "so-leitor" }, extenso)
        : extenso ? el("abbr", { title: extenso }, texto) : texto);
    raiz.append(el("section", { id: "tela-classificacao", class: "tela" },
      el("div", { class: "tela-cabecalho" },
        el("h2", {}, "Classificação ", rotulo),
        el("div", { class: "barra-tela" },
          controle,
          el("button", {
            type: "button", id: "btn-png-classificacao", class: "acao-direita",
            onclick: () => app.exportarPNG("classificacao"),
          }, Icones.svg("imagem"), "Baixar imagem")),
        el("p", { class: "legenda" },
          el("span", { class: "amostra-classificado" }), " Top 8 vai para a fase final"),
        el("details", { class: "como-ler" },
          el("summary", {}, "Como ler"),
          el("ul", {},
            el("li", {}, "▲▼: quantas posições o jogador subiu ou caiu em relação à semana anterior."),
            el("li", {}, Icones.svg("empate"), " Empate técnico (iguais em pontos, vitórias, saldo e gols pró): use ",
              Icones.svg("subir"), Icones.svg("descer"), " para definir a ordem (confronto direto ou sorteio)."),
            el("li", {}, "Situação: considera todos os resultados possíveis dos jogos pendentes (vitória, empate com gols, 0×0, derrota), "
              + "comparando pontos e vitórias. Saldo e gols pró só contam entre quem já não joga mais. "
              + "Só aparece na classificação ao vivo, quando faltam poucos jogos."))),
        resumoSituacao),
      el("div", { class: "tabela-rolagem" },
        el("table", { class: "classificacao" }, cabecalhoTabela, corpo))));

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
      const nome = app.botaoJogador(linha.id, `ver-linha-${linha.id}`);
      if (!empate) return el("td", { class: "col-jogador" }, nome);

      const nomes = empate.grupo.map((id) => nomePorId.get(id)).join(", ");
      const i = empate.grupo.indexOf(linha.id);
      const ultimo = empate.grupo.length - 1;
      const explicacao = empate.ordemManual
        ? `Empate técnico (${nomes}). Ordem definida pelo organizador.`
        : `Empate técnico (${nomes}). Ordem alfabética provisória: defina com as setas ou confirme a ordem atual.`;
      return el("td", { class: "col-jogador" },
        nome,
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

    function celulaSituacao(s, jogos) {
      return el("td", { class: `col-situacao ${s.situacao}` }, Util.marcaSituacao(s, jogos));
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

    // Linha acima da tabela: quantos jogos e cenários a coluna Situação considera, ou quando ela aparece.
    function renderizarResumoSituacao(atual, situacoes) {
      const pendentes = atual.jogos.filter((j) => !j.resultado).length;
      let texto = "";
      if (situacoes) {
        texto = pendentes
          ? `Situação: ${Util.plural(pendentes, "jogo pendente", "jogos pendentes")}, ${Util.plural(Regras.contarCenarios(pendentes, atual.campeonato.config), "cenário", "cenários")}.`
          : "Situação: todos os jogos lançados.";
      } else if (semanaClassificacao === null && atual.jogos.length) {
        texto = `Situação disponível quando faltarem até ${Regras.limitePendentesSituacoes(atual.campeonato.config)} jogos (faltam ${pendentes}).`;
      }
      resumoSituacao.textContent = texto;
      resumoSituacao.hidden = !texto;
    }

    function renderizarTabela(tabela, editavel, situacoes, jogos) {
      const porId = situacoes && new Map(situacoes.map((s) => [s.id, s]));
      cabecalhoTabela.replaceChildren(el("tr", {}, colunas.map(cabecalho), porId && cabecalho(colunaSituacao)));
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
          return el("tr", { class: classe.trim() || null, id: `linha-${linha.id}` },
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
            el("td", {}, String(linha.jogos)),
            porId && celulaSituacao(porId.get(linha.id), jogos));
        })
      );
    }

    // `tabela` é a classificação ao vivo; com uma semana escolhida, mostra a daquela semana (sem a Situação).
    function renderizarClassificacao(atual, tabela) {
      const cfg = atual.campeonato.config;
      const ultimaSemana = Regras.ultimaSemanaComResultado(atual.jogos, cfg);
      if (semanaClassificacao !== null && (ultimaSemana === null || semanaClassificacao > ultimaSemana)) semanaClassificacao = null;
      const aoVivo = semanaClassificacao === null;
      const tabelaVista = aoVivo
        ? tabela
        : Regras.classificacaoPorSemana(app.base(), atual.jogos, atual.desempatesManuais, cfg, semanaClassificacao);
      const situacoes = aoVivo && atual.jogos.length ? Util.situacoes(app.base(), atual) : null;
      controleClassificacao(ultimaSemana);
      rotulo.textContent = aoVivo ? "" : `após a semana ${semanaClassificacao}`;
      renderizarResumoSituacao(atual, situacoes);
      renderizarTabela(tabelaVista, aoVivo, situacoes, atual.jogos);
    }

    return {
      renderizar: renderizarClassificacao,
      semanaVista: () => semanaClassificacao,
      reiniciarVisao() { semanaClassificacao = null; },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, classificacao: { criar } };
})();
