// Tela "Calendário": sortear, conferir as restrições, trocar jogadores à mão e confirmar.

(function () {
  "use strict";

  const { el } = Util;

  function criar(app) {
    const { estado, nomePorId, avisar, renderizar, cadastroTravado } = app;

    let editandoSlot = null; // { indice, lado, pos } do jogador do rascunho em troca

    function sortear() {
      if (cadastroTravado()) return;
      const atual = estado.atual();
      const { jogadores, config: cfg, sorteio } = atual.campeonato;
      if (sorteio && sorteio.rascunho && !confirm("Já existe um sorteio. Sortear de novo descarta esse calendário, inclusive as trocas manuais.\n\nSortear de novo?")) return;
      const semente = Math.floor(Math.random() * 2147483646) + 1;
      const r = Regras.gerarCalendario(jogadores, { jogosPorJogador: cfg.jogosPorJogador, semanas: cfg.semanas, semente });
      if (r.erro) {
        avisar(r.erro, "erro");
        return;
      }
      editandoSlot = null;
      estado.modificar(`sortear calendário (semente ${semente})`, (s) => {
        s.campeonato.sorteio = { semente, confirmado: false, rascunho: r.calendario };
      });
    }

    function descartarSorteio() {
      if (cadastroTravado()) return;
      editandoSlot = null;
      estado.modificar("descartar sorteio", (s) => { s.campeonato.sorteio = null; });
    }

    function confirmarCalendario() {
      const atual = estado.atual();
      const { jogadores, config: cfg, sorteio } = atual.campeonato;
      if (cadastroTravado() || !sorteio || !sorteio.rascunho) return;
      const aval = Regras.avaliarCalendario(jogadores, sorteio.rascunho, cfg);
      const aviso = aval.pronto ? "" : `Atenção, o calendário não respeita o regulamento:\n\n- ${aval.violacoes.join("\n- ")}\n\n`;
      if (!confirm(`${aviso}Confirmar o calendário? Depois disso só dá para renomear jogadores (Desfazer ainda volta, mas lançamentos feitos depois se perdem).`)) return;
      editandoSlot = null;
      estado.modificar("confirmar calendário", (s) => {
        s.jogos = Regras.calendarioParaJogos(sorteio.rascunho);
        s.campeonato.sorteio = { semente: sorteio.semente, confirmado: true };
      });
      app.irParaAba("rodadas"); // próximo passo: lançar os jogos
    }

    function trocarNoRascunho(indice, lado, pos, novoId) {
      const sorteio = estado.atual().campeonato.sorteio;
      editandoSlot = null;
      if (!sorteio || !sorteio.rascunho || !sorteio.rascunho[indice]) { renderizar(); return; }
      const jogo = sorteio.rascunho[indice];
      const antigo = jogo[`dupla${lado}`][pos];
      const novo = Regras.trocarJogadorNoCalendario(sorteio.rascunho, indice, lado, pos, novoId);
      if (!estado.modificar(`calendário (semana ${jogo.semana}): ${nomePorId.get(antigo)} → ${nomePorId.get(novoId)}`, (s) => {
        s.campeonato.sorteio.rascunho = novo;
      })) {
        renderizar();
      }
    }

    function seletorDeJogador(calendario, indice, lado, pos) {
      const jogo = calendario[indice];
      const doJogo = new Map(); // quem joga na semana -> número do jogo (1, 2...) dentro da semana
      let numero = 0;
      calendario.forEach((j, i) => {
        if (j.semana !== jogo.semana) return;
        numero++;
        for (const id of [...j.dupla1, ...j.dupla2]) doJogo.set(id, { numero, indice: i });
      });
      const atualId = jogo[`dupla${lado}`][pos];
      const jogadores = [...nomePorId].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      return el("select", {
        id: "troca-jogador", "aria-label": "Trocar jogador",
        onchange: (ev) => trocarNoRascunho(indice, lado, pos, ev.target.value),
      },
        jogadores.map(([id, nome]) => {
          const onde = doJogo.get(id);
          let rotulo = nome;
          if (id === atualId) rotulo += " (atual)";
          else if (onde) rotulo += ` — joga no jogo ${onde.numero} (trocam de lugar)`;
          else rotulo += " — descansa nesta semana";
          return el("option", { value: id, selected: id === atualId }, rotulo);
        }));
    }

    function nomeNoCalendario(calendario, indice, lado, pos, editavel) {
      const id = calendario[indice][`dupla${lado}`][pos];
      if (editavel && editandoSlot && editandoSlot.indice === indice && editandoSlot.lado === lado && editandoSlot.pos === pos) {
        return el("span", { class: "troca-slot" },
          seletorDeJogador(calendario, indice, lado, pos),
          el("button", { type: "button", class: "discreto mini", onclick: () => { editandoSlot = null; renderizar(); } }, "Cancelar"));
      }
      if (!editavel) return el("span", { class: "nome" }, nomePorId.get(id));
      return el("button", {
        type: "button", class: "nome-slot", title: `Trocar ${nomePorId.get(id)}`,
        id: `slot-${indice}-${lado}-${pos}`,
        onclick: () => { editandoSlot = { indice, lado, pos }; app.focarDepois("troca-jogador"); renderizar(); },
      }, nomePorId.get(id));
    }

    function semanaDoCalendario(calendario, semana, editavel) {
      const doJogo = calendario.map((j, i) => ({ j, i })).filter(({ j }) => j.semana === semana);
      const jogam = new Set(doJogo.flatMap(({ j }) => [...j.dupla1, ...j.dupla2]));
      const descansam = [...nomePorId].filter(([id]) => !jogam.has(id)).map(([, nome]) => nome);
      return el("section", { class: "semana-calendario", id: `semana-${semana}` },
        el("h3", {}, `Semana ${semana} `, el("span", { class: "contagem" }, `(${doJogo.length} jogos)`)),
        el("ol", {}, doJogo.map(({ j, i }) => el("li", {},
          nomeNoCalendario(calendario, i, 1, 0, editavel), " + ", nomeNoCalendario(calendario, i, 1, 1, editavel),
          el("span", { class: "x" }, " × "),
          nomeNoCalendario(calendario, i, 2, 0, editavel), " + ", nomeNoCalendario(calendario, i, 2, 1, editavel)))),
        descansam.length
          ? el("p", { class: "descansam" }, `Descansam (${descansam.length}): ${descansam.join(", ")}`)
          : null);
    }

    function painelQualidade(aval, cfg) {
      const porSemana = aval.jogosPorSemana.join(" · ");
      return el("div", { class: "qualidade", id: "qualidade-calendario" },
        aval.pronto
          ? el("p", { class: "tudo-certo" },
              `✔ Regulamento respeitado: todos com ${cfg.jogosPorJogador} jogos, no máximo um por semana e nenhum parceiro repetido.`)
          : el("ul", { class: "avisos-chave" }, aval.violacoes.map((v) => el("li", {}, `⚠️ ${v}`))),
        el("p", { class: "legenda" },
          aval.adversariosRepetidos.pares
            ? `Adversários repetidos: ${aval.adversariosRepetidos.pares} par(es), no máximo ${aval.adversariosRepetidos.maxVezes} vezes (o sorteio evita, mas pode acontecer).`
            : "Adversários repetidos: nenhum.",
          ` Jogos por semana: ${porSemana}.`));
    }

    function renderizarCalendario(atual) {
      const camp = atual.campeonato;
      const confirmado = Regras.cadastroTravado(camp, atual.jogos);
      const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
      const rascunho = !confirmado && camp.sorteio ? camp.sorteio.rascunho || null : null;
      if (editandoSlot && (!rascunho || !rascunho[editandoSlot.indice])) editandoSlot = null;

      const resumo = document.getElementById("resumo-calendario");
      resumo.textContent = confirmado ? `confirmado · ${atual.jogos.length} jogos` : rascunho ? "sorteio em análise" : "";

      const calendario = confirmado ? atual.jogos : rascunho;
      const alvo = document.getElementById("conteudo-calendario");

      if (!calendario) {
        alvo.replaceChildren(
          el("p", { class: "legenda" },
            "Sorteia as duplas e os jogos de todas as semanas de uma vez: todos com o mesmo número de jogos, no máximo um por semana e sem repetir parceiro. Depois você pode trocar jogadores à mão e confirmar."),
          diag.pronto
            ? null
            : el("ul", { class: "avisos-chave" }, [el("li", {}, "⚠️ Antes de sortear, ajuste o cadastro:"), ...diag.problemas.map((p) => el("li", {}, p))]),
          el("button", { type: "button", id: "btn-sortear", class: "primario", disabled: !diag.pronto, onclick: sortear }, "🎲 Sortear calendário"));
        return;
      }

      const aval = Regras.avaliarCalendario(camp.jogadores, calendario, camp.config);
      const semanas = Array.from({ length: camp.config.semanas }, (_, i) => i + 1);
      alvo.replaceChildren(
        confirmado
          ? el("p", { class: "legenda" }, `Calendário confirmado${camp.sorteio ? ` (semente ${camp.sorteio.semente})` : ""}. Os jogos são lançados na aba Rodadas.`)
          : el("div", { class: "acoes-calendario" },
              el("button", { type: "button", id: "btn-sortear", onclick: sortear }, "🎲 Sortear de novo"),
              el("button", { type: "button", id: "btn-confirmar-calendario", class: "primario", onclick: confirmarCalendario }, "✔ Confirmar calendário"),
              el("button", { type: "button", id: "btn-descartar-sorteio", class: "discreto", onclick: descartarSorteio }, "Descartar"),
              el("span", { class: "legenda" }, `Semente do sorteio: ${camp.sorteio.semente}. Clique num nome para trocar o jogador.`)),
        painelQualidade(aval, camp.config),
        el("div", { class: "semanas-calendario" }, semanas.map((n) => semanaDoCalendario(calendario, n, !confirmado))));
    }

    return {
      renderizar: renderizarCalendario,
      limparRascunhos() { editandoSlot = null; },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, calendario: { criar } };
})();
