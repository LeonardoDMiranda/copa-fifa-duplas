// Tela "Rodadas": jogos por semana, lançamento de placar, W.O., anular e top 8 ao vivo.
// Os nomes abrem a ficha do jogador (js/telas/ficha.js), com todos os jogos dele.

(function () {
  "use strict";

  const { el, buscar, MAX_GOLS, lerGols, formatarSaldo, classeDoLado, botaoIcone } = Util;

  function criar(app, raiz) {
    const { estado, nomePorId, renderizar, numerosNaSemana, nomesDupla } = app;

    const contador = el("span", { id: "contador-jogos", class: "contador" });
    const navegacao = el("div", { id: "navegacao-semanas" });
    const lista = el("div", { id: "lista-jogos", class: "lista-jogos" });
    const painel = el("aside", { id: "painel-top", class: "tela painel-top", "aria-label": "Classificação ao vivo", hidden: true });
    raiz.append(
      el("section", { id: "tela-jogos", class: "tela" },
        el("div", { class: "tela-cabecalho" },
          el("h2", {}, "Rodadas ", contador),
          el("p", { class: "legenda" },
            "Digite o placar e aperte Tab/Enter. 0×0 conta empate, mas vale 0 ponto. \"Anular\" fecha um jogo sem efeito "
            + "(ex.: W.O. das duas duplas).")),
        navegacao, lista),
      painel);

    // Texto digitado nos campos de placar e ainda não lançado (placar pela metade, inválido
    // ou em edição). Não vai para o estado; tem prioridade sobre o estado ao redesenhar.
    const rascunhos = new Map(); // id do jogo -> { 1: texto, 2: texto }
    const woAberto = new Set(); // ids de jogos com a escolha de W.O. aberta
    const errosCampo = new Map(); // id do jogo -> mensagem de placar inválido, mostrada embaixo do placar
    const remarcando = new Map(); // id do jogo -> semana de destino escolhida, com a remarcação aberta
    let semanaEscolhida = null; // semana exibida; começa na semana em andamento e depois só muda por escolha

    // "Semana 3 · Jogo 2": usado nas mensagens e nas descrições do "Desfazer".
    function rotuloDe(id) {
      const jogos = estado.atual().jogos;
      return Util.rotuloDoJogo(jogos.find((j) => j.id === id), numerosNaSemana(jogos));
    }

    // ---------- cartões de jogo ----------

    function cartaoJogo(jogo, numero) {
      const r = jogo.resultado;
      const ehWO = r && r.tipo === "wo";
      const anulado = r && r.tipo === "anulado";
      const rascunho = rascunhos.get(jogo.id);
      const erro = errosCampo.get(jogo.id);
      const idErro = `erro-jogo-${jogo.id}`;
      const semanas = estado.atual().campeonato.config.semanas;

      let valor1 = "", valor2 = "";
      if (ehWO) { valor1 = r.vencedor === 1 ? "3" : "0"; valor2 = r.vencedor === 2 ? "3" : "0"; }
      else if (anulado) { valor1 = "–"; valor2 = "–"; }
      else if (rascunho) { valor1 = rascunho[1]; valor2 = rascunho[2]; }
      else if (r) { valor1 = String(r.gols1); valor2 = String(r.gols2); }

      // Com erro, os dois campos apontam para a mensagem; só o inválido fica marcado.
      const entrada = (lado, valor) => el("input", {
        id: `gols-${jogo.id}-${lado}`,
        class: "gols" + (!anulado && lerGols(valor).invalido ? " invalido" : ""),
        type: "text",
        inputmode: "numeric",
        autocomplete: "off",
        maxlength: "2",
        value: valor,
        disabled: ehWO || anulado,
        "aria-label": `Gols da dupla ${lado} no jogo ${numero}`,
        "aria-invalid": erro && lerGols(valor).invalido ? "true" : null,
        "aria-describedby": erro ? idErro : null,
        dataset: { jogo: jogo.id, lado: String(lado) },
        oninput: guardarRascunho,
        onchange: aoMudarPlacar,
        onkeydown: aoTeclarNoPlacar,
        onfocus: (ev) => ev.target.select(),
      });

      let status = "Pendente";
      if (ehWO) status = `W.O. – dupla ${r.vencedor} presente (3×0)`;
      else if (anulado) status = "Anulado – sem efeito na classificação";
      else if (r) status = "Lançado";

      const idPergunta = `wo-${jogo.id}-pergunta`;
      const acoes = remarcando.has(jogo.id)
        ? painelRemarcar(jogo)
        : woAberto.has(jogo.id)
        ? el("div", { class: "jogo-acoes", role: "group", "aria-labelledby": idPergunta },
            el("span", { class: "pergunta", id: idPergunta }, "W.O.: qual dupla estava presente?"),
            el("button", { type: "button", id: `wo-${jogo.id}-1`, onclick: () => lancarWO(jogo.id, 1) }, nomesDupla(jogo.dupla1)),
            el("button", { type: "button", id: `wo-${jogo.id}-2`, onclick: () => lancarWO(jogo.id, 2) }, nomesDupla(jogo.dupla2)),
            el("button", {
              type: "button", id: `wo-${jogo.id}-cancelar`, class: "discreto",
              onclick: () => { woAberto.delete(jogo.id); renderizar(); },
            }, "Cancelar"))
        : el("div", { class: "jogo-acoes" },
            el("button", { type: "button", id: `wo-${jogo.id}`, onclick: () => { woAberto.add(jogo.id); renderizar(); } }, "W.O."),
            el("button", {
              type: "button", id: `anular-${jogo.id}`,
              title: "Fecha o jogo sem efeito: ninguém recebe pontos, V/E/D nem gols (ex.: W.O. das duas duplas)",
              onclick: () => anularJogo(jogo.id),
            }, "Anular"),
            el("button", {
              type: "button", id: `remarcar-${jogo.id}`, disabled: Boolean(r) || semanas < 2,
              title: r ? "Jogo com resultado não pode ser remarcado: limpe o resultado antes" : "Muda o jogo de semana (adiar ou adiantar)",
              onclick: () => abrirRemarcacao(jogo),
            }, "Remarcar"),
            el("button", {
              type: "button", id: `limpar-${jogo.id}`, class: "discreto",
              disabled: !r && !(rascunho && (rascunho[1] || rascunho[2])),
              onclick: () => limparJogo(jogo.id),
            }, "Limpar"));

      // A semana já está na navegação: no título do cartão, só o leitor de tela a ouve.
      return el("article", { class: `jogo ${r ? "lancado" : "pendente"}`, id: `jogo-${jogo.id}` },
        el("div", { class: "jogo-topo" },
          el("h3", { class: "jogo-numero" }, el("span", { class: "so-leitor" }, `Semana ${Regras.semanaDoJogo(jogo)} · `), `Jogo ${numero}`),
          Regras.jogoRemarcado(jogo) && el("span", { class: "marca-remarcado", title: "Este jogo foi combinado para outra semana" },
            `Remarcado da semana ${jogo.semanaOriginal}`),
          el("span", { class: "status" }, status)),
        el("div", { class: "jogo-placar" },
          el("div", { class: "dupla d1" + classeDoLado(r, 1) },
            jogo.dupla1.map((id) => el("span", { class: "nome" }, app.botaoJogador(id, `ver-${jogo.id}-${id}`)))),
          el("div", { class: "placar" }, entrada(1, valor1), el("span", { class: "x" }, "×"), entrada(2, valor2)),
          el("div", { class: "dupla d2" + classeDoLado(r, 2) },
            jogo.dupla2.map((id) => el("span", { class: "nome" }, app.botaoJogador(id, `ver-${jogo.id}-${id}`))))),
        Util.mensagemDeErro(idErro, erro),
        acoes);
    }

    // ---------- remarcação ----------

    // Abre a escolha da semana, já na vizinha (a seguinte; na última semana, a anterior).
    function abrirRemarcacao(jogo) {
      const semanas = estado.atual().campeonato.config.semanas;
      const semana = Regras.semanaDoJogo(jogo);
      remarcando.set(jogo.id, semana < semanas ? semana + 1 : semana - 1);
      app.focarDepois(`remarcar-${jogo.id}-semana`);
      renderizar();
    }

    // "Fulano já joga na semana 5." (vazio se ninguém do jogo joga nela). Não impede a remarcação.
    function avisoDeOcupados(jogo, destino) {
      const ids = Regras.jogadoresOcupadosNaSemana(estado.atual().jogos, jogo.id, destino);
      if (!ids.length) return "";
      const nomes = ids.map((id) => nomePorId.get(id));
      const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
      return `${lista} ${nomes.length > 1 ? "já jogam" : "já joga"} na semana ${destino}.`;
    }

    function painelRemarcar(jogo) {
      const atual = estado.atual();
      const cfg = atual.campeonato.config;
      const semanaAtualDoJogo = Regras.semanaDoJogo(jogo);
      const idSelect = `remarcar-${jogo.id}-semana`;
      const idAviso = `remarcar-${jogo.id}-aviso`;
      const aviso = el("p", { class: "aviso-remarcar", id: idAviso, role: "status" });
      const confirmar = el("button", { type: "button", id: `remarcar-${jogo.id}-confirmar`, class: "primario", onclick: () => remarcarJogo(jogo.id) }, "Remarcar");

      // Atualiza só o aviso e o botão: redesenhar tiraria o foco do seletor.
      function atualizar() {
        const destino = remarcando.get(jogo.id);
        const texto = avisoDeOcupados(jogo, destino);
        aviso.replaceChildren(...(texto ? [Icones.svg("alerta"), el("span", {}, texto)] : []));
        confirmar.disabled = Boolean(Regras.erroDeRemarcacao(estado.atual().jogos, jogo.id, destino, cfg));
      }

      const seletor = el("select", {
        id: idSelect, "aria-describedby": idAviso,
        onchange: (ev) => { remarcando.set(jogo.id, Number(ev.target.value)); atualizar(); },
      }, Array.from({ length: cfg.semanas }, (_, i) => i + 1).map((n) => el("option", {
        value: String(n), selected: n === remarcando.get(jogo.id), disabled: n === semanaAtualDoJogo,
      }, n === semanaAtualDoJogo ? `Semana ${n} (atual)` : `Semana ${n}`)));
      atualizar();

      return el("div", { class: "jogo-acoes jogo-remarcar", role: "group", "aria-label": "Remarcar o jogo" },
        el("label", { for: idSelect, class: "pergunta" }, "Remarcar para a"),
        seletor,
        confirmar,
        el("button", {
          type: "button", id: `remarcar-${jogo.id}-cancelar`, class: "discreto",
          onclick: () => { remarcando.delete(jogo.id); app.focarDepois(`remarcar-${jogo.id}`); renderizar(); },
        }, "Cancelar"),
        aviso);
    }

    // Move o jogo e mostra a semana nova, com o foco no botão dele.
    function remarcarJogo(id) {
      const semana = remarcando.get(id);
      const rotulo = rotuloDe(id);
      remarcando.delete(id);
      const mudou = estado.modificar(`remarcar (${rotulo}) para a semana ${semana}`, (s) => {
        s.jogos = Regras.remarcarJogo(s.jogos, id, semana, s.campeonato.config);
      });
      if (mudou) {
        semanaEscolhida = semana;
        app.focarDepois(`remarcar-${id}`);
      }
      renderizar();
    }

    // ---------- navegação por semana ----------

    function irParaSemana(n) {
      semanaEscolhida = n;
      renderizar();
    }

    function semanaExibida(atual) {
      const total = atual.campeonato.config.semanas;
      if (semanaEscolhida === null || semanaEscolhida < 1 || semanaEscolhida > total) {
        semanaEscolhida = Regras.semanaAtual(atual.jogos, atual.campeonato.config);
      }
      return semanaEscolhida;
    }

    // ◀ S1 … Sn ▶ e "Semana atual". O progresso de cada semana vai na cor do botão e, por extenso,
    // no texto para o leitor de tela (e na dica).
    function navegacaoSemanas(atual, semana) {
      const cfg = atual.campeonato.config;
      const progresso = Regras.progressoPorSemana(atual.jogos, cfg.semanas, cfg);
      const emAndamento = Regras.semanaAtual(atual.jogos, cfg);

      const jogam = new Set(atual.jogos.filter((j) => Regras.semanaDoJogo(j) === semana).flatMap((j) => [...j.dupla1, ...j.dupla2]));
      const descansam = [...nomePorId.keys()].filter((id) => !jogam.has(id));

      const botaoSemana = (p) => {
        let classe = "chip-semana";
        let situacao = `${p.resolvidos} de ${Util.plural(p.total, "jogo resolvido", "jogos resolvidos")}`;
        if (p.total && p.resolvidos === p.total) { classe += " completa"; situacao = "completa"; }
        else if (p.resolvidos) classe += " parcial";
        if (p.semana === emAndamento) { classe += " em-andamento"; situacao += ", em andamento"; }
        if (p.semana === semana) classe += " selecionada";
        const descricao = `Semana ${p.semana}, ${situacao}`;
        return el("button", {
          type: "button", id: `chip-semana-${p.semana}`, class: classe, title: descricao,
          "aria-current": p.semana === semana ? "true" : null, onclick: () => irParaSemana(p.semana),
        }, el("span", { "aria-hidden": "true" }, `S${p.semana}`), el("span", { class: "so-leitor" }, descricao));
      };

      return el("div", { class: "navegacao-semanas" },
        el("div", { class: "seletor-semana", role: "group", "aria-label": "Semanas" },
          botaoIcone({ icone: "anterior", rotulo: "Semana anterior", id: "semana-anterior", disabled: semana <= 1, onclick: () => irParaSemana(semana - 1) }),
          progresso.map(botaoSemana),
          botaoIcone({ icone: "proximo", rotulo: "Próxima semana", id: "semana-proxima", disabled: semana >= cfg.semanas, onclick: () => irParaSemana(semana + 1) }),
          el("button", {
            type: "button", id: "semana-atual", class: "discreto", disabled: semana === emAndamento,
            title: `Ir para a semana em andamento (semana ${emAndamento})`, onclick: () => irParaSemana(emAndamento),
          }, "Semana atual")),
        descansam.length
          ? el("p", { class: "descansam" }, `Descansam na semana ${semana} (${descansam.length}): `,
            descansam.map((id, i) => [i ? ", " : null, app.botaoJogador(id, `ver-descansa-${id}`)]))
          : null);
    }

    // Painel ao lado dos jogos: top 8 ao vivo e quem vem logo atrás, para acompanhar sem trocar de aba.
    const PERSEGUIDORES = 2;
    function painelTop(painel, tabela) {
      const vagas = Regras.VAGAS_FASE_FINAL;
      painel.replaceChildren(
        el("h3", {}, "Top 8 ao vivo"),
        el("table", { class: "tabela-top" },
          el("thead", {}, el("tr", {},
            el("th", { scope: "col", class: "col-pos" }, el("abbr", { title: "Posição" }, "Pos")),
            el("th", { scope: "col", class: "col-jogador" }, "Jogador"),
            el("th", { scope: "col" }, el("abbr", { title: "Pontos" }, "Pts")),
            el("th", { scope: "col" }, el("abbr", { title: "Vitórias" }, "V")),
            el("th", { scope: "col" }, el("abbr", { title: "Saldo de gols" }, "SG")))),
          el("tbody", {}, tabela.slice(0, vagas + PERSEGUIDORES).map((l) => {
            let classe = l.posicao <= vagas ? "classificado" : "perseguidor";
            if (l.posicao === vagas) classe += " linha-corte";
            return el("tr", { class: classe },
              el("td", { class: "col-pos" }, `${l.posicao}º`),
              el("td", { class: "col-jogador" }, app.botaoJogador(l.id, `ver-top-${l.id}`), l.empateTecnico && el("span", { class: "empate", title: "Empate técnico" },
                Icones.svg("empate"), el("span", { class: "so-leitor" }, "empate técnico"))),
              el("td", { class: "col-pts" }, String(l.pontos)),
              el("td", {}, String(l.v)),
              el("td", {}, formatarSaldo(l.sg)));
          }))),
        el("button", { type: "button", id: "btn-ver-classificacao", class: "discreto mini", onclick: () => app.irParaAba("classificacao") },
          "Ver classificação completa", Icones.svg("seguir")));
    }

    function renderizarJogos(atual, tabela) {
      painel.hidden = !atual.jogos.length;
      if (!atual.jogos.length) {
        painel.replaceChildren();
        navegacao.replaceChildren();
        const camp = atual.campeonato;
        const cadastroPronto = Regras.diagnosticarCampeonato(camp.jogadores, camp.config).pronto;
        lista.replaceChildren(cadastroPronto
          ? app.proximoPasso("Nenhum jogo ainda: os jogos aparecem aqui depois de sortear e confirmar o calendário.", "sorteio", "Ir para o Sorteio")
          : app.proximoPasso("Nenhum jogo ainda: cadastre os jogadores e depois sorteie o calendário.", "jogadores", "Ir para Jogadores"));
        contador.textContent = "";
        return;
      }
      const semana = semanaExibida(atual);
      const numeros = numerosNaSemana(atual.jogos);
      navegacao.replaceChildren(navegacaoSemanas(atual, semana));
      lista.replaceChildren(...atual.jogos
        .filter((j) => Regras.semanaDoJogo(j) === semana)
        .map((jogo) => cartaoJogo(jogo, numeros.get(jogo.id))));
      painelTop(painel, tabela);
      const lancados = atual.jogos.filter((j) => j.resultado).length;
      contador.textContent = `${lancados}/${atual.jogos.length} lançados`;
    }

    // ---------- lançamento ----------

    // A cada tecla, guarda o texto dos dois campos do jogo (sem redesenhar).
    function guardarRascunho(ev) {
      const id = ev.target.dataset.jogo;
      rascunhos.set(id, {
        1: buscar(raiz, `gols-${id}-1`).value,
        2: buscar(raiz, `gols-${id}-2`).value,
      });
    }

    // Enter não dispara "change" fora de <form>: no 1º campo pula para o 2º; no 2º, lança.
    function aoTeclarNoPlacar(ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const { jogo: id, lado } = ev.target.dataset;
      if (lado === "1") buscar(raiz, `gols-${id}-2`).focus();
      else ev.target.blur();
    }

    function aoMudarPlacar(ev) {
      guardarRascunho(ev);
      const id = ev.target.dataset.jogo;
      const rascunho = rascunhos.get(id);

      const g1 = lerGols(rascunho[1]), g2 = lerGols(rascunho[2]);
      if (g1.invalido || g2.invalido) {
        errosCampo.set(id, `Placar inválido: use números de 0 a ${MAX_GOLS}.`);
        renderizar();
        return;
      }
      errosCampo.delete(id);

      if (g1.vazio || g2.vazio) {
        // Apagou um lado de um placar já lançado: o jogo volta a ficar pendente.
        if (!estado.modificar(`apagar placar (${rotuloDe(id)})`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
          renderizar();
        }
        return;
      }

      rascunhos.delete(id);
      const resultado = { tipo: "placar", gols1: g1.valor, gols2: g2.valor };
      if (!estado.modificar(`placar ${g1.valor}×${g2.valor} (${rotuloDe(id)})`, (s) => {
        s.jogos.find((j) => j.id === id).resultado = resultado;
      })) {
        renderizar();
      }
    }

    function lancarWO(id, vencedor) {
      woAberto.delete(id);
      rascunhos.delete(id);
      errosCampo.delete(id);
      if (!estado.modificar(`W.O., dupla ${vencedor} presente (${rotuloDe(id)})`, (s) => {
        s.jogos.find((j) => j.id === id).resultado = { tipo: "wo", vencedor };
      })) {
        renderizar();
      }
    }

    function anularJogo(id) {
      rascunhos.delete(id);
      errosCampo.delete(id);
      if (!estado.modificar(`anular (${rotuloDe(id)})`, (s) => { s.jogos.find((j) => j.id === id).resultado = { tipo: "anulado" }; })) {
        renderizar();
      }
    }

    function limparJogo(id) {
      rascunhos.delete(id);
      errosCampo.delete(id);
      if (!estado.modificar(`limpar (${rotuloDe(id)})`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
        renderizar();
      }
    }

    return {
      renderizar: renderizarJogos,
      // Escolhe a semana exibida (ex.: um jogo escolhido na ficha do jogador); o redesenho fica com quem chama.
      mostrarSemana(n) { semanaEscolhida = n; },
      limparRascunhos() {
        rascunhos.clear();
        woAberto.clear();
        remarcando.clear();
        errosCampo.clear();
      },
      reiniciarVisao() {
        semanaEscolhida = null;
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, rodadas: { criar } };
})();
