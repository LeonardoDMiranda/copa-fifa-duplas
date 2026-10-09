// Tela "Mata-mata": chaveamento, placares com prorrogação e pênaltis, troca de duplas e pódio.

(function () {
  "use strict";

  const { el, confirmar, MAX_GOLS, lerGols } = Util;

  const ROTULOS = { semi1: "Semifinal 1", semi2: "Semifinal 2", terceiro: "3º lugar", final: "Final" };
  const ORIGEM_DUPLA = {
    semi1: ["1º + 8º", "2º + 7º"],
    semi2: ["3º + 6º", "4º + 5º"],
    terceiro: ["Perdedor da Semi 1", "Perdedor da Semi 2"],
    final: ["Vencedor da Semi 1", "Vencedor da Semi 2"],
  };
  const NOMES_CAMPO = {
    gols: "tempo normal", prorrogacao: "prorrogação", penaltis: "pênaltis",
  };

  function criar(app) {
    const { estado, nomePorId, avisar, renderizar, tabelaAtual, nomesDupla } = app;

    const rascunhosMM = new Map(); // id do campo do mata-mata -> texto inválido digitado
    let editandoDupla = null; // { chave, lado } da dupla do mata-mata em edição
    let focarAposId = null; // após Enter num placar do mata-mata, foca o campo seguinte a este

    // Depois de cada alteração, guarda as duplas que jogaram o 3º lugar e a final (ver
    // Regras.fixarDuplasJogadas): corrigir uma semi não passa esses placares para outra dupla.
    function modificarMataMata(descricao, alterar) {
      const mudou = estado.modificar(descricao, (s) => {
        s.mataMata = Regras.fixarDuplasJogadas(alterar(s.mataMata), tabelaAtual(), app.config());
      });
      if (!mudou) renderizar();
    }

    function painelGerar(atual, tabela) {
      if (tabela.length < Regras.VAGAS_FASE_FINAL) {
        return app.proximoPasso(`O chaveamento precisa de pelo menos ${Regras.VAGAS_FASE_FINAL} jogadores cadastrados.`, "jogadores", "Ir para Jogadores");
      }
      const avisos = Regras.avisosParaGerarChaveamento(atual.jogos, tabela, atual.campeonato.config);
      const semis = Regras.duplasDasSemis(tabela);
      const previa = (chave) => el("li", {},
        el("strong", {}, `${ROTULOS[chave]}: `),
        `${nomesDupla(semis[chave][0])} (${ORIGEM_DUPLA[chave][0]}) × ${nomesDupla(semis[chave][1])} (${ORIGEM_DUPLA[chave][1]})`);
      return el("div", { class: "gerar-chave" },
        el("p", {}, "Prévia pela classificação atual:"),
        el("ul", { class: "previa" }, previa("semi1"), previa("semi2")),
        avisos.length
          ? el("ul", { class: "avisos-chave" }, avisos.map((a) => el("li", {}, `⚠️ ${a}`)))
          : el("p", { class: "tudo-certo" }, "✔ Todos os jogos lançados e nenhum empate técnico pendente no top 8."),
        el("button", { type: "button", id: "btn-gerar-chave", class: "primario", onclick: gerarChaveamento }, "Gerar chaveamento"));
    }

    // Recalcula na hora do clique: um placar digitado logo antes pode ter mudado a classificação.
    async function gerarChaveamento() {
      const avisos = Regras.avisosParaGerarChaveamento(estado.atual().jogos, tabelaAtual(), app.config());
      if (avisos.length && !(await confirmar(`- ${avisos.join("\n- ")}`,
        { titulo: "Gerar o chaveamento mesmo assim?", acao: "Gerar mesmo assim", perigo: true }))) return;
      if (estado.atual().mataMata) return; // outra janela já gerou
      const tabela = tabelaAtual();
      estado.modificar("gerar chaveamento", (s) => { s.mataMata = Regras.gerarMataMata(tabela); });
    }

    async function apagarChaveamento() {
      const ok = await confirmar("Apaga as duplas trocadas e todos os resultados do mata-mata. Dá para voltar com \"Desfazer\".",
        { titulo: "Apagar o chaveamento?", acao: "Apagar chaveamento", perigo: true });
      if (!ok) return;
      app.limparRascunhos();
      estado.modificar("apagar chaveamento", (s) => { s.mataMata = null; });
    }

    // Trocar duplas de um confronto que já tem placar: os placares ficam e passam a valer para as novas.
    async function confirmarTrocaComPlacar(confrontos) {
      const comPlacar = confrontos.filter((c) => c.partidas.length && (c.lado1.desatualizada || c.lado2.desatualizada));
      if (!comPlacar.length) return true;
      return confirmar(`${comPlacar.map((c) => ROTULOS[c.chave]).join(" e ")} já ${comPlacar.length > 1 ? "têm" : "tem"} placar lançado. `
        + "Os placares continuam e passam a valer para as novas duplas.",
      { titulo: "Trocar as duplas mesmo assim?", acao: "Trocar as duplas", perigo: true });
    }

    function barraMataMata(mm) {
      const semis = [mm.semi1, mm.semi2];
      const finais = [mm.final, mm.terceiro];
      const desatualizado = semis.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
      const finaisDesatualizadas = finais.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
      return el("div", { class: "barra-mata-mata" },
        desatualizado && el("div", { class: "alerta" },
          "⚠️ A classificação mudou depois de gerar o chaveamento: as duplas automáticas das semis não batem mais com ela. ",
          el("button", {
            type: "button", id: "btn-atualizar-semis",
            onclick: async () => {
              if (!(await confirmarTrocaComPlacar(semis))) return;
              modificarMataMata("atualizar duplas das semis", (m) => Regras.atualizarDuplasDasSemis(m, tabelaAtual()));
            },
          }, "Usar duplas da classificação atual")),
        finaisDesatualizadas && el("div", { class: "alerta" },
          "⚠️ O resultado de uma semifinal mudou depois de lançar placares da final ou do 3º lugar: "
          + "as duplas que jogaram não são mais as que saem das semis. ",
          el("button", {
            type: "button", id: "btn-atualizar-finais",
            onclick: async () => {
              if (!(await confirmarTrocaComPlacar(finais))) return;
              modificarMataMata("atualizar duplas da final e do 3º lugar", (m) => Regras.atualizarDuplasDasFinais(m, tabelaAtual(), app.config()));
            },
          }, "Usar duplas que saem das semis")),
        el("button", { type: "button", id: "btn-apagar-chave", class: "perigo discreto", onclick: apagarChaveamento }, "Apagar chaveamento"));
    }

    function editorDupla(c, lado, tabela) {
      const info = c[`lado${lado}`];
      const atual = info.dupla || [null, null];
      const seletor = (n) => el("select", { id: `sel-${c.chave}-${lado}-${n}`, "aria-label": `Jogador ${n} da dupla ${lado}` },
        el("option", { value: "" }, "— jogador —"),
        tabela.map((l) => el("option", { value: l.id, selected: l.id === atual[n - 1] }, `${l.posicao}º ${l.nome}`)));
      const sel1 = seletor(1), sel2 = seletor(2);

      const salvar = () => {
        const dupla = [sel1.value, sel2.value];
        const outra = c[`dupla${3 - lado}`];
        const erro = lado === 1 ? Regras.validarDuplas(dupla, outra) : Regras.validarDuplas(outra, dupla);
        if (erro) { avisar(erro, "erro"); return; }
        editandoDupla = null;
        modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} = ${nomesDupla(dupla)}`,
          (m) => Regras.definirDupla(m, c.chave, lado, dupla));
      };
      const voltar = () => {
        editandoDupla = null;
        modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} volta à automática`,
          (m) => Regras.voltarDuplaAutomatica(m, c.chave, lado, tabelaAtual()));
      };

      return el("div", { class: "editor-dupla" },
        el("span", { class: "rotulo-lado" }, `Dupla ${lado}`),
        sel1, el("span", {}, "+"), sel2,
        el("button", { type: "button", id: `salvar-${c.chave}-${lado}`, class: "primario mini", onclick: salvar }, "Salvar"),
        info.manual && el("button", { type: "button", class: "mini", onclick: voltar }, "Voltar à automática"),
        el("button", { type: "button", class: "discreto mini", onclick: () => { editandoDupla = null; renderizar(); } }, "Cancelar"));
    }

    function linhaDupla(c, lado, tabela) {
      if (editandoDupla && editandoDupla.chave === c.chave && editandoDupla.lado === lado) {
        return editorDupla(c, lado, tabela);
      }
      const info = c[`lado${lado}`];
      const vencedora = c.serie.vencedor === lado;
      const perdedora = Boolean(c.serie.vencedor) && !vencedora;
      let classe = "dupla-mm";
      if (vencedora) classe += " vencedora";
      if (perdedora) classe += " perdedora";
      return el("div", { class: classe },
        el("span", { class: "rotulo-lado" }, `Dupla ${lado}`),
        el("span", { class: info.dupla ? "nomes" : "nomes a-definir" },
          info.dupla ? nomesDupla(info.dupla) : ORIGEM_DUPLA[c.chave][lado - 1]),
        info.dupla && !info.manual && el("span", { class: "origem-dupla" }, ORIGEM_DUPLA[c.chave][lado - 1]),
        info.manual && el("span", {
          class: "tag-manual",
          title: info.automatica ? `Automática seria: ${nomesDupla(info.automatica)}` : "Automática ainda indefinida",
        }, "alterada manualmente"),
        vencedora && el("span", { class: "tag-vence" }, "✔ vence"),
        el("button", {
          type: "button", id: `editar-${c.chave}-${lado}`, class: "discreto mini", title: "Trocar esta dupla",
          onclick: () => { editandoDupla = { chave: c.chave, lado }; renderizar(); },
        }, "✎"));
    }

    function entradaMM(c, indice, campo, rotulo, partida) {
      const id = `mm-${c.chave}-${indice}-${campo}`;
      const salvo = partida[campo];
      const valor = rascunhosMM.has(id) ? rascunhosMM.get(id) : (salvo === null || salvo === undefined ? "" : String(salvo));
      return el("input", {
        id,
        class: "gols mini" + (lerGols(valor).invalido ? " invalido" : ""),
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        maxlength: "2",
        value: valor,
        "aria-label": `${ROTULOS[c.chave]}, jogo ${indice + 1}, ${rotulo}, dupla ${campo.slice(-1)}`,
        dataset: { chave: c.chave, indice: String(indice), campo },
        onchange: aoMudarPlacarMM,
        onkeydown: aoTeclarNoPlacarMM,
        onfocus: (ev) => ev.target.select(),
      });
    }

    function linhaPlacarMM(c, indice, etapa, partida) {
      const rotulo = NOMES_CAMPO[etapa];
      return el("div", { class: `linha-placar etapa-${etapa}` },
        el("span", { class: "rotulo-etapa" }, rotulo[0].toUpperCase() + rotulo.slice(1)),
        entradaMM(c, indice, `${etapa}1`, rotulo, partida),
        el("span", { class: "x" }, "×"),
        entradaMM(c, indice, `${etapa}2`, rotulo, partida));
    }

    function partidasDoConfronto(c) {
      const blocos = [];
      for (let i = 0; i < c.serie.partidasVisiveis; i++) {
        const partida = c.partidas[i] || {};
        const a = c.serie.analises[i] || { vencedor: null, precisa: "placar" };
        const etapa = a.decididoEm || a.precisa;
        const mostrarProrrogacao = etapa === "prorrogacao" || etapa === "penaltis";
        const mostrarPenaltis = etapa === "penaltis";

        let resultado = "";
        if (a.vencedor) {
          resultado = `✔ Dupla ${a.vencedor} vence`
            + (a.decididoEm === "prorrogacao" ? " na prorrogação" : a.decididoEm === "penaltis" ? " nos pênaltis" : "");
        } else if (a.erro) resultado = a.erro;
        else if (a.precisa === "prorrogacao") resultado = "Empate: lance a prorrogação.";
        else if (a.precisa === "penaltis") resultado = "Empate na prorrogação: lance os pênaltis.";

        blocos.push(el("div", { class: "partida" },
          c.melhorDe > 1 && el("div", { class: "titulo-partida" }, `Jogo ${i + 1}`),
          linhaPlacarMM(c, i, "gols", partida),
          mostrarProrrogacao && linhaPlacarMM(c, i, "prorrogacao", partida),
          mostrarPenaltis && linhaPlacarMM(c, i, "penaltis", partida),
          resultado && el("div", { class: "resultado-partida" + (a.erro ? " erro" : a.vencedor ? "" : " pendente") }, resultado)));
      }
      return el("div", { class: "partidas" }, blocos);
    }

    function cartaoConfronto(c, tabela) {
      const serie = c.serie;
      let status = "A jogar";
      if (!c.pronto) status = "Aguardando duplas";
      else if (serie.vencedor) status = "Decidido";
      else if (c.partidas.length) status = "Em andamento";
      const erroDuplas = c.pronto ? Regras.validarDuplas(c.dupla1, c.dupla2) : null;

      return el("article", { class: `confronto${serie.vencedor ? " decidido" : ""}`, id: `mm-${c.chave}` },
        el("div", { class: "jogo-topo" },
          el("span", { class: "jogo-numero" }, ROTULOS[c.chave]),
          el("span", { class: "origem" }, c.melhorDe > 1 ? `Melhor de ${c.melhorDe}` : "Jogo único"),
          el("span", { class: "status" }, status)),
        linhaDupla(c, 1, tabela),
        linhaDupla(c, 2, tabela),
        erroDuplas && el("div", { class: "alerta" }, `⚠️ ${erroDuplas}`),
        c.melhorDe > 1 && c.pronto && el("div", { class: "placar-serie" },
          `Série: ${serie.vitorias[0]} × ${serie.vitorias[1]}`,
          !serie.vencedor && el("span", { class: "legenda" }, ` (vence quem fizer ${serie.necessarias})`)),
        c.pronto
          ? partidasDoConfronto(c)
          : el("p", { class: "legenda" }, "Os placares abrem quando as duas duplas estiverem definidas."));
    }

    function podio(p) {
      const degrau = (classe, medalha, titulo, dupla) => el("div", { class: `degrau ${classe}${dupla ? "" : " vazio"}` },
        el("span", { class: "medalha" }, medalha),
        el("div", {},
          el("div", { class: "titulo-degrau" }, titulo),
          dupla
            ? dupla.map((id) => el("div", { class: "nome-podio" }, nomePorId.get(id)))
            : el("div", { class: "a-definir" }, "a definir")));
      return el("div", { class: "podio", id: "podio" },
        degrau("ouro", "🥇", "Campeões", p.campeoes),
        degrau("prata", "🥈", "Vice", p.vice),
        degrau("bronze", "🥉", "3º lugar", p.terceiro));
    }

    function renderizarMataMata(atual, tabela) {
      const alvo = document.getElementById("conteudo-mata-mata");
      if (!atual.mataMata) {
        alvo.replaceChildren(painelGerar(atual, tabela));
        return;
      }
      const mm = Regras.resolverMataMata(atual.mataMata, tabela, atual.campeonato.config);
      alvo.replaceChildren(
        barraMataMata(mm),
        el("div", { class: "chave" },
          el("div", { class: "coluna-chave" },
            el("h3", {}, "Semifinais"),
            cartaoConfronto(mm.semi1, tabela),
            cartaoConfronto(mm.semi2, tabela)),
          el("div", { class: "coluna-chave" },
            el("h3", {}, "Final"),
            cartaoConfronto(mm.final, tabela),
            el("h3", {}, "Disputa de 3º lugar"),
            cartaoConfronto(mm.terceiro, tabela)),
          el("div", { class: "coluna-chave" },
            el("h3", {}, "Pódio"),
            podio(mm.podio))));
    }

    function aoMudarPlacarMM(ev) {
      const campoEl = ev.target;
      const { chave, campo } = campoEl.dataset;
      const indice = Number(campoEl.dataset.indice);
      const g = lerGols(campoEl.value);
      if (g.invalido) {
        rascunhosMM.set(campoEl.id, campoEl.value);
        avisar(`Placar inválido em ${ROTULOS[chave]}: use números de 0 a ${MAX_GOLS}.`, "erro");
        renderizar();
        return;
      }
      rascunhosMM.delete(campoEl.id);
      const valor = g.vazio ? null : g.valor;
      const jogo = Regras.MELHOR_DE[chave] > 1 ? ` jogo ${indice + 1}` : "";
      const etapa = NOMES_CAMPO[campo.slice(0, -1)];
      modificarMataMata(
        `${ROTULOS[chave]}${jogo}: ${etapa} da dupla ${campo.slice(-1)} = ${valor === null ? "vazio" : valor}`,
        (m) => Regras.definirCampoPartida(m, chave, indice, campo, valor));
    }

    // Enter lança o campo e vai para o próximo campo do mesmo confronto (inclusive
    // prorrogação/pênaltis que aparecem depois de um empate).
    function aoTeclarNoPlacarMM(ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      focarAposId = ev.target.id;
      ev.target.blur();
      renderizar();
    }

    // Chamado depois do redesenho. Devolve true se havia um Enter pendente (mesmo que o
    // campo tenha sumido): nesse caso o foco anterior não é restaurado.
    function focarCampoSeguinte() {
      if (!focarAposId) return false;
      const anterior = document.getElementById(focarAposId);
      focarAposId = null;
      if (!anterior) return true;
      const campos = [...anterior.closest(".confronto").querySelectorAll("input")];
      const proximo = campos[campos.indexOf(anterior) + 1];
      if (proximo) proximo.focus();
      return true;
    }

    return {
      renderizar: renderizarMataMata,
      focarCampoSeguinte,
      limparRascunhos() {
        rascunhosMM.clear();
        editandoDupla = null;
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, mataMata: { criar } };
})();
