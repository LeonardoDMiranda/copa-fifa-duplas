// Tela "Rodadas": jogos por semana, lançamento de placar, W.O., anular, agenda do jogador e top 8 ao vivo.

(function () {
  "use strict";

  const { el, MAX_GOLS, lerGols, formatarSaldo, classeDoLado } = Util;

  function criar(app) {
    const { estado, nomePorId, avisar, renderizar, numerosNaSemana, nomesDupla } = app;

    // Texto digitado nos campos de placar e ainda não lançado (placar pela metade, inválido
    // ou em edição). Não vai para o estado; tem prioridade sobre o estado ao redesenhar.
    const rascunhos = new Map(); // id do jogo -> { 1: texto, 2: texto }
    const woAberto = new Set(); // ids de jogos com a escolha de W.O. aberta
    let semanaEscolhida = null; // semana exibida; começa na semana em andamento e depois só muda por escolha
    let agendaJogador = null; // jogador escolhido na agenda

    // ---------- cartões de jogo ----------

    function cartaoJogo(jogo, numero) {
      const r = jogo.resultado;
      const ehWO = r && r.tipo === "wo";
      const anulado = r && r.tipo === "anulado";
      const rascunho = rascunhos.get(jogo.id);

      let valor1 = "", valor2 = "";
      if (ehWO) { valor1 = r.vencedor === 1 ? "3" : "0"; valor2 = r.vencedor === 2 ? "3" : "0"; }
      else if (anulado) { valor1 = "–"; valor2 = "–"; }
      else if (rascunho) { valor1 = rascunho[1]; valor2 = rascunho[2]; }
      else if (r) { valor1 = String(r.gols1); valor2 = String(r.gols2); }

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

      const acoes = woAberto.has(jogo.id)
        ? el("div", { class: "jogo-acoes" },
            el("span", { class: "pergunta" }, "Qual dupla estava presente?"),
            el("button", { type: "button", id: `wo-${jogo.id}-1`, onclick: () => lancarWO(jogo.id, 1) }, "Dupla 1"),
            el("button", { type: "button", id: `wo-${jogo.id}-2`, onclick: () => lancarWO(jogo.id, 2) }, "Dupla 2"),
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
              type: "button", id: `limpar-${jogo.id}`, class: "discreto",
              disabled: !r && !(rascunho && (rascunho[1] || rascunho[2])),
              onclick: () => limparJogo(jogo.id),
            }, "Limpar"));

      return el("article", { class: `jogo ${r ? "lancado" : "pendente"}`, id: `jogo-${jogo.id}` },
        el("div", { class: "jogo-topo" },
          el("span", { class: "jogo-numero" }, `Jogo ${numero}`),
          el("span", { class: "origem" }, `Semana ${jogo.semana}`),
          el("span", { class: "status" }, status)),
        el("div", { class: "jogo-placar" },
          el("div", { class: "dupla d1" + classeDoLado(r, 1) },
            jogo.dupla1.map((id) => el("span", { class: "nome" }, nomePorId.get(id)))),
          el("div", { class: "placar" }, entrada(1, valor1), el("span", { class: "x" }, "×"), entrada(2, valor2)),
          el("div", { class: "dupla d2" + classeDoLado(r, 2) },
            jogo.dupla2.map((id) => el("span", { class: "nome" }, nomePorId.get(id))))),
        acoes);
    }

    // ---------- navegação por semana e agenda ----------

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

    function navegacaoSemanas(atual, semana) {
      const cfg = atual.campeonato.config;
      const progresso = Regras.progressoPorSemana(atual.jogos, cfg.semanas, cfg);
      const emAndamento = Regras.semanaAtual(atual.jogos, cfg);
      const rotulo = (p) => `Semana ${p.semana} (${p.resolvidos}/${p.total})`;

      const jogam = new Set(atual.jogos.filter((j) => Regras.semanaDoJogo(j) === semana).flatMap((j) => [...j.dupla1, ...j.dupla2]));
      const descansam = [...nomePorId].filter(([id]) => !jogam.has(id)).map(([, nome]) => nome);

      return el("div", { class: "navegacao-semanas" },
        el("div", { class: "seletor-semana" },
          el("button", { type: "button", id: "semana-anterior", title: "Semana anterior", disabled: semana <= 1, onclick: () => irParaSemana(semana - 1) }, "◀"),
          el("select", { id: "select-semana", "aria-label": "Semana", onchange: (ev) => irParaSemana(Number(ev.target.value)) },
            progresso.map((p) => el("option", { value: String(p.semana), selected: p.semana === semana }, rotulo(p)))),
          el("button", { type: "button", id: "semana-proxima", title: "Próxima semana", disabled: semana >= cfg.semanas, onclick: () => irParaSemana(semana + 1) }, "▶"),
          semana !== emAndamento && el("button", {
            type: "button", id: "semana-em-andamento", class: "discreto", onclick: () => irParaSemana(emAndamento),
          }, `Ir para a semana em andamento (${emAndamento})`)),
        el("div", { class: "chips-semanas" }, progresso.map((p) => {
          let classe = "chip-semana";
          if (p.total && p.resolvidos === p.total) classe += " completa";
          else if (p.resolvidos) classe += " parcial";
          if (p.semana === semana) classe += " selecionada";
          return el("button", { type: "button", id: `chip-semana-${p.semana}`, class: classe, title: rotulo(p), onclick: () => irParaSemana(p.semana) },
            `S${p.semana}`);
        })),
        descansam.length
          ? el("p", { class: "descansam" }, `Descansam na semana ${semana} (${descansam.length}): ${descansam.join(", ")}`)
          : null);
    }

    // Como o jogo ficou para quem estava no `lado` (1 ou 2).
    function resultadoParaLado(jogo, lado, cfg) {
      const r = jogo.resultado;
      const ef = Regras.efeitosDoResultado(r, cfg);
      if (!ef) return { texto: "pendente", classe: "pendente" };
      if (r.tipo === "anulado") return { texto: "anulado", classe: "anulada" };
      const e = ef[lado];
      const placar = `${e.gp}×${e.gc}${r.tipo === "wo" ? " (W.O.)" : ""}`;
      if (e.v) return { texto: `vitória ${placar}`, classe: "vencedora" };
      if (e.d) return { texto: `derrota ${placar}`, classe: "perdedora" };
      return { texto: `empate ${placar}`, classe: "empate" };
    }

    function agendaDoJogador(atual, tabela) {
      const cfg = atual.campeonato.config;
      if (agendaJogador && !nomePorId.has(agendaJogador)) agendaJogador = null;
      const ordenados = [...nomePorId].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      const seletor = el("select", {
        id: "select-agenda", "aria-label": "Jogador da agenda",
        onchange: (ev) => { agendaJogador = ev.target.value || null; renderizar(); },
      },
        el("option", { value: "" }, "— escolha um jogador —"),
        ordenados.map(([id, nome]) => el("option", { value: id, selected: id === agendaJogador }, nome)));

      let corpo = null;
      if (agendaJogador) {
        const numeros = numerosNaSemana(atual.jogos);
        const linhaDele = tabela.find((l) => l.id === agendaJogador);
        const jogosDele = atual.jogos.filter((j) => j.dupla1.includes(agendaJogador) || j.dupla2.includes(agendaJogador));
        corpo = el("div", {},
          el("p", { class: "legenda", id: "agenda-resumo" },
            `${linhaDele.posicao}º · ${linhaDele.pontos} pts · ${linhaDele.v}V ${linhaDele.e}E ${linhaDele.d}D · SG ${formatarSaldo(linhaDele.sg)} · ${jogosDele.length} jogos no calendário`),
          el("ol", { class: "agenda-lista" }, jogosDele.map((j) => {
            const lado = j.dupla1.includes(agendaJogador) ? 1 : 2;
            const minha = lado === 1 ? j.dupla1 : j.dupla2;
            const outra = lado === 1 ? j.dupla2 : j.dupla1;
            const parceiro = nomePorId.get(minha.find((id) => id !== agendaJogador));
            const r = resultadoParaLado(j, lado, cfg);
            return el("li", {},
              el("button", {
                type: "button", class: "nome-slot", title: "Ver esta semana", onclick: () => irParaSemana(Regras.semanaDoJogo(j)),
              }, `Semana ${Regras.semanaDoJogo(j)} · Jogo ${numeros.get(j.id)}`),
              ` com ${parceiro} × ${nomesDupla(outra)} `,
              el("span", { class: `resultado-agenda ${r.classe}` }, r.texto));
          })));
      }
      return el("div", { class: "agenda" },
        el("h3", {}, "Agenda do jogador"),
        el("label", { class: "campo-config" }, seletor),
        corpo);
    }

    // Painel ao lado dos jogos: top 8 ao vivo e quem vem logo atrás, para acompanhar sem trocar de aba.
    const PERSEGUIDORES = 2;
    function painelTop(painel, tabela) {
      const vagas = Regras.VAGAS_FASE_FINAL;
      painel.replaceChildren(
        el("h3", {}, "Top 8 ao vivo"),
        el("table", { class: "tabela-top" },
          el("thead", {}, el("tr", {},
            el("th", { class: "col-pos" }, "Pos"), el("th", { class: "col-jogador" }, "Jogador"),
            el("th", { title: "Pontos" }, "Pts"), el("th", { title: "Vitórias" }, "V"), el("th", { title: "Saldo de gols" }, "SG"))),
          el("tbody", {}, tabela.slice(0, vagas + PERSEGUIDORES).map((l) => {
            let classe = l.posicao <= vagas ? "classificado" : "perseguidor";
            if (l.posicao === vagas) classe += " linha-corte";
            return el("tr", { class: classe },
              el("td", { class: "col-pos" }, `${l.posicao}º`),
              el("td", { class: "col-jogador" }, l.nome, l.empateTecnico && el("span", { class: "empate", title: "Empate técnico" }, "⚖️")),
              el("td", { class: "col-pts" }, String(l.pontos)),
              el("td", {}, String(l.v)),
              el("td", {}, formatarSaldo(l.sg)));
          }))),
        el("button", { type: "button", id: "btn-ver-classificacao", class: "discreto mini", onclick: () => app.irParaAba("classificacao") },
          "Ver classificação completa →"));
    }

    function renderizarJogos(atual, tabela) {
      const lista = document.getElementById("lista-jogos");
      const navegacao = document.getElementById("navegacao-semanas");
      const agenda = document.getElementById("agenda-jogador");
      const painel = document.getElementById("painel-top");
      painel.hidden = !atual.jogos.length;
      if (!atual.jogos.length) {
        painel.replaceChildren();
        navegacao.replaceChildren();
        agenda.replaceChildren();
        lista.replaceChildren(el("p", { class: "legenda" }, "Nenhum jogo ainda: cadastre os jogadores e sorteie o calendário."));
        document.getElementById("contador-jogos").textContent = "";
        return;
      }
      const semana = semanaExibida(atual);
      const numeros = numerosNaSemana(atual.jogos);
      navegacao.replaceChildren(navegacaoSemanas(atual, semana));
      lista.replaceChildren(...atual.jogos
        .filter((j) => Regras.semanaDoJogo(j) === semana)
        .map((jogo) => cartaoJogo(jogo, numeros.get(jogo.id))));
      agenda.replaceChildren(agendaDoJogador(atual, tabela));
      painelTop(painel, tabela);
      const lancados = atual.jogos.filter((j) => j.resultado).length;
      document.getElementById("contador-jogos").textContent = `${lancados}/${atual.jogos.length} lançados`;
    }

    // ---------- lançamento ----------

    // A cada tecla, guarda o texto dos dois campos do jogo (sem redesenhar).
    function guardarRascunho(ev) {
      const id = ev.target.dataset.jogo;
      rascunhos.set(id, {
        1: document.getElementById(`gols-${id}-1`).value,
        2: document.getElementById(`gols-${id}-2`).value,
      });
    }

    // Enter não dispara "change" fora de <form>: no 1º campo pula para o 2º; no 2º, lança.
    function aoTeclarNoPlacar(ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const { jogo: id, lado } = ev.target.dataset;
      if (lado === "1") document.getElementById(`gols-${id}-2`).focus();
      else ev.target.blur();
    }

    function aoMudarPlacar(ev) {
      guardarRascunho(ev);
      const id = ev.target.dataset.jogo;
      const rascunho = rascunhos.get(id);

      const g1 = lerGols(rascunho[1]), g2 = lerGols(rascunho[2]);
      if (g1.invalido || g2.invalido) {
        avisar(`Placar inválido no jogo ${id}: use números de 0 a ${MAX_GOLS}.`, "erro");
        renderizar();
        return;
      }

      if (g1.vazio || g2.vazio) {
        // Apagou um lado de um placar já lançado: o jogo volta a ficar pendente.
        if (!estado.modificar(`apagar placar do ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
          renderizar();
        }
        return;
      }

      rascunhos.delete(id);
      const resultado = { tipo: "placar", gols1: g1.valor, gols2: g2.valor };
      if (!estado.modificar(`placar do ${id}: ${g1.valor}×${g2.valor}`, (s) => {
        s.jogos.find((j) => j.id === id).resultado = resultado;
      })) {
        renderizar();
      }
    }

    function lancarWO(id, vencedor) {
      woAberto.delete(id);
      rascunhos.delete(id);
      if (!estado.modificar(`W.O. no ${id} (dupla ${vencedor} presente)`, (s) => {
        s.jogos.find((j) => j.id === id).resultado = { tipo: "wo", vencedor };
      })) {
        renderizar();
      }
    }

    function anularJogo(id) {
      rascunhos.delete(id);
      if (!estado.modificar(`anular ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = { tipo: "anulado" }; })) {
        renderizar();
      }
    }

    function limparJogo(id) {
      rascunhos.delete(id);
      if (!estado.modificar(`limpar ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
        renderizar();
      }
    }

    return {
      renderizar: renderizarJogos,
      limparRascunhos() {
        rascunhos.clear();
        woAberto.clear();
      },
      reiniciarVisao() {
        semanaEscolhida = null;
        agendaJogador = null;
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, rodadas: { criar } };
})();
