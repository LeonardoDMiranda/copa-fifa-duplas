// Tela "O que está em jogo": garantidos, em disputa e eliminados para o top 8.

(function () {
  "use strict";

  const { el } = Util;

  function criar(app, raiz) {
    const { nomePorId, numerosNaSemana, nomesDupla } = app;

    const resumo = el("span", { id: "resumo-em-jogo", class: "contador" });
    const conteudo = el("div", { id: "conteudo-em-jogo", class: "colunas-em-jogo" });
    raiz.append(el("section", { id: "tela-em-jogo", class: "tela" },
      el("div", { class: "tela-cabecalho" },
        el("h2", {}, "O que está em jogo ", resumo),
        el("p", { class: "legenda" },
          "Considera todos os resultados possíveis dos jogos pendentes (vitória, empate com gols, 0×0, derrota), "
          + "comparando pontos e vitórias. Saldo e gols pró só contam entre quem já não joga mais.")),
      conteudo));

    // O cálculo enumera até Regras.MAX_CENARIOS_SITUACOES cenários: só refaz quando jogos,
    // desempates ou jogadores mudam. Devolve null se houver pendentes demais
    // (ver Regras.limitePendentesSituacoes).
    let cacheSituacoes = { chave: null, valor: null };
    function situacoesDe(atual) {
      const chave = JSON.stringify([atual.jogos.map((j) => j.resultado), atual.desempatesManuais, atual.campeonato]);
      if (cacheSituacoes.chave !== chave) {
        cacheSituacoes = {
          chave,
          valor: Regras.calcularSituacoes(app.base(), atual.jogos, atual.desempatesManuais, atual.campeonato.config),
        };
      }
      return cacheSituacoes.valor;
    }

    function descreverProximoJogo(jogoId, jogadorId, jogos) {
      const jogo = jogos.find((j) => j.id === jogoId);
      const minha = jogo.dupla1.includes(jogadorId) ? jogo.dupla1 : jogo.dupla2;
      const outra = minha === jogo.dupla1 ? jogo.dupla2 : jogo.dupla1;
      const parceiro = nomePorId.get(minha.find((id) => id !== jogadorId));
      return `${Util.rotuloDoJogo(jogo, numerosNaSemana(jogos))}: com ${parceiro} × ${nomesDupla(outra)}`;
    }

    function itemEmJogo(s, linha, jogos) {
      const detalhes = [];
      if (s.situacao === "disputa") {
        if (s.jogosPendentes.length) {
          const mais = s.jogosPendentes.length - 1;
          detalhes.push(el("div", { class: "proximo-jogo" },
            `Próximo: ${descreverProximoJogo(s.jogosPendentes[0], s.id, jogos)}`,
            mais > 0 && el("span", { class: "tag-repete", title: `Joga mais ${mais} depois deste` }, `+${mais}`)));
        } else {
          detalhes.push(el("div", { class: "nao-joga" }, "Não joga mais, só pode cair"));
        }
        const marcas = [];
        if (s.dependeDoSaldo) marcas.push(el("span", { class: "tag-saldo", title: "Pode empatar em pontos e vitórias na briga pela 8ª vaga" }, "depende do saldo"));
        if (s.dependeDoDesempate) {
          marcas.push(el("span", { class: "tag-saldo", title: "Empate total com quem já terminou: defina a ordem do empate técnico na classificação" },
            Icones.svg("empate"), "depende do desempate"));
        }
        if (marcas.length) detalhes.push(el("div", { class: "marcas" }, marcas));
      }
      return el("li", { class: `item-em-jogo ${s.situacao}`, id: `em-jogo-${s.id}` },
        el("div", { class: "linha-item" },
          el("span", { class: "pos-item" }, `${linha.posicao}º`),
          el("span", { class: "nome-item" }, s.nome),
          el("span", { class: "pts-item" }, `${linha.pontos} pts · ${linha.v} V`)),
        detalhes);
    }

    function renderizarEmJogo(atual, tabela) {
      const pendentes = atual.jogos.filter((j) => !j.resultado).length;
      const situacoes = atual.jogos.length ? situacoesDe(atual) : null;
      if (!situacoes) {
        resumo.textContent = "";
        conteudo.replaceChildren(el("p", { class: "legenda mensagem-em-jogo" },
          atual.jogos.length
            ? `Disponível quando faltarem até ${Regras.limitePendentesSituacoes(atual.campeonato.config)} jogos (faltam ${pendentes}).`
            : "Ainda não há jogos."));
        return;
      }
      const porId = new Map(situacoes.map((s) => [s.id, s]));
      const colunas = { garantido: [], disputa: [], eliminado: [] };
      for (const linha of tabela) {
        const s = porId.get(linha.id);
        colunas[s.situacao].push(itemEmJogo(s, linha, atual.jogos));
      }
      resumo.textContent = pendentes
        ? `${Util.plural(pendentes, "jogo pendente", "jogos pendentes")} · ${Util.plural(Regras.contarCenarios(pendentes, atual.campeonato.config), "cenário", "cenários")}`
        : "todos os jogos lançados";

      const coluna = (tipo, icone, titulo) => el("div", { class: `coluna-em-jogo ${tipo}`, id: `coluna-${tipo}` },
        el("h3", {}, Icones.svg(icone), `${titulo} `, el("span", { class: "contagem" }, `(${colunas[tipo].length})`)),
        colunas[tipo].length
          ? el("ul", {}, colunas[tipo])
          : el("p", { class: "legenda" }, "Ninguém."));
      conteudo.replaceChildren(
        coluna("garantido", "ok", "Garantidos no top 8"),
        coluna("disputa", "disputa", "Em disputa"),
        coluna("eliminado", "eliminado", "Eliminados"));
    }

    return { renderizar: renderizarEmJogo };
  }

  globalThis.Telas = { ...globalThis.Telas, emJogo: { criar } };
})();
