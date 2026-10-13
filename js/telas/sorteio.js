// Tela "Sorteio" (passo 3 da preparação; depois da confirmação, o calendário completo em Ajustes):
// sortear, conferir as restrições, trocar jogadores à mão e confirmar.

(function () {
  "use strict";

  const { el, confirmar, buscar, plural } = Util;

  // Lista de pendências com um ícone de alerta em cada item.
  const itemAlerta = (texto) => el("li", {}, Icones.svg("alerta"), el("span", {}, texto));

  function criar(app, raiz) {
    const { estado, nomePorId, avisar, renderizar, cadastroTravado } = app;

    const resumo = el("span", { id: "resumo-sorteio", class: "contador" });
    const alvo = el("div", { id: "conteudo-sorteio" });
    raiz.append(el("section", { id: "tela-sorteio", class: "tela" },
      el("div", { class: "tela-cabecalho" }, el("h2", {}, "Sorteio do calendário ", resumo)),
      alvo));

    let editandoSlot = null; // { indice, lado, pos } do jogador do rascunho em troca
    let nivelPorId = new Map(); // id -> estrelas (ou null), refeito a cada desenho

    // Estrelas ao lado do nome: só nesta tela e na de jogadores (nunca no telão nem nos PNGs).
    function nivel(id) {
      const e = nivelPorId.get(id);
      return Regras.validarEstrelas(e) ? e : null;
    }
    function marcaNivel(id) {
      const e = nivel(id);
      return e ? el("small", { class: "nivel" },
        Icones.svg("estrela"), el("span", { "aria-hidden": "true" }, String(e)), el("span", { class: "so-leitor" }, plural(e, "estrela", "estrelas"))) : null;
    }

    async function sortear() {
      if (cadastroTravado()) return;
      const anterior = estado.atual().campeonato.sorteio;
      if (anterior && anterior.rascunho) {
        const ok = await confirmar("O calendário atual será descartado, inclusive as trocas feitas à mão.",
          { titulo: "Sortear de novo?", acao: "Sortear de novo" });
        // Outra janela pode ter mudado o campeonato enquanto a pergunta estava aberta.
        if (!ok || cadastroTravado() || estado.atual().campeonato.sorteio !== anterior) return;
      }
      // O sorteio leva cerca de 1 s: mostra que está trabalhando antes de começar a conta.
      const botao = buscar(raiz, "btn-sortear");
      if (botao) { botao.disabled = true; botao.replaceChildren(Icones.svg("sortear"), "Sorteando…"); }
      await new Promise((resolver) => setTimeout(resolver, 30));
      if (cadastroTravado()) return;
      const { jogadores, config: cfg } = estado.atual().campeonato;
      const semente = Math.floor(Math.random() * 2147483646) + 1;
      const r = Regras.gerarCalendario(jogadores, { jogosPorJogador: cfg.jogosPorJogador, semanas: cfg.semanas, semente });
      renderizar(); // devolve o botão ao normal (também quando dá erro)
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

    async function confirmarCalendario() {
      const atual = estado.atual();
      const { jogadores, config: cfg, sorteio } = atual.campeonato;
      if (cadastroTravado() || !sorteio || !sorteio.rascunho) return;
      const aval = Regras.avaliarCalendario(jogadores, sorteio.rascunho, cfg);
      const aviso = aval.pronto ? "" : `Atenção, o calendário não respeita o regulamento:\n\n- ${aval.violacoes.join("\n- ")}\n\n`;
      const ok = await confirmar(`${aviso}Depois disso só dá para renomear jogadores. "Desfazer" ainda volta, mas os placares lançados depois se perdem.`,
        { titulo: "Confirmar o calendário?", acao: "Confirmar calendário", perigo: !aval.pronto });
      if (!ok || estado.atual().campeonato.sorteio !== sorteio) return;
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
          let rotulo = nivel(id) ? `${nome} (${plural(nivel(id), "estrela", "estrelas")})` : nome;
          if (id === atualId) rotulo += ", atual";
          else if (onde) rotulo += `, joga no jogo ${onde.numero} (trocam de lugar)`;
          else rotulo += ", descansa nesta semana";
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
      if (!editavel) return el("span", { class: "nome" }, nomePorId.get(id), nivel(id) ? " " : null, marcaNivel(id));
      return el("button", {
        type: "button", class: "nome-slot", title: `Trocar ${nomePorId.get(id)}`,
        id: `slot-${indice}-${lado}-${pos}`,
        onclick: () => { editandoSlot = { indice, lado, pos }; app.focarDepois("troca-jogador"); renderizar(); },
      }, nomePorId.get(id), nivel(id) ? " " : null, marcaNivel(id));
    }

    // Diferença de nível do jogo (posição a posição); nada quando é 0 ou não dá para calcular.
    function marcaDiferenca(diferenca) {
      if (!diferenca) return null;
      const fora = diferenca > Regras.DIFERENCA_ACEITAVEL;
      return el("span", {
        class: `diferenca${fora ? " alta" : ""}`,
        title: `Diferença de nível entre as duplas: ${plural(diferenca, "estrela", "estrelas")}, comparando o mais forte com o mais forte e o mais fraco com o mais fraco`
          + (fora ? ". Fora do aceitável (máximo de 1)." : ""),
      }, `Δ ${diferenca}`);
    }

    function semanaDoCalendario(calendario, semana, editavel, diferencas) {
      const doJogo = calendario.map((j, i) => ({ j, i })).filter(({ j }) => j.semana === semana);
      const jogam = new Set(doJogo.flatMap(({ j }) => [...j.dupla1, ...j.dupla2]));
      const descansam = [...nomePorId].filter(([id]) => !jogam.has(id)).map(([, nome]) => nome);
      return el("section", { class: "semana-calendario", id: `semana-${semana}` },
        el("h3", {}, `Semana ${semana} `, el("span", { class: "contagem" }, `(${plural(doJogo.length, "jogo", "jogos")})`)),
        el("ol", {}, doJogo.map(({ j, i }) => el("li", {},
          nomeNoCalendario(calendario, i, 1, 0, editavel), " + ", nomeNoCalendario(calendario, i, 1, 1, editavel),
          el("span", { class: "x" }, " × "),
          nomeNoCalendario(calendario, i, 2, 0, editavel), " + ", nomeNoCalendario(calendario, i, 2, 1, editavel),
          diferencas ? marcaDiferenca(diferencas[i]) : null))),
        descansam.length
          ? el("p", { class: "descansam" }, `Descansam (${descansam.length}): ${descansam.join(", ")}`)
          : null);
    }

    function painelQualidade(aval, cfg, confirmado) {
      const porSemana = aval.jogosPorSemana.join(" · ");
      return el("div", { class: "qualidade", id: "qualidade-calendario" },
        aval.pronto
          ? el("p", { class: "tudo-certo" }, Icones.svg("ok"),
              `Regulamento respeitado: todos com ${plural(cfg.jogosPorJogador, "jogo", "jogos")}, no máximo um por semana e nenhum parceiro repetido.`)
          : el("ul", { class: "avisos-chave" }, aval.violacoes.map(itemAlerta)),
        el("p", { class: "legenda" },
          aval.adversariosRepetidos.pares
            ? `Adversários repetidos: ${plural(aval.adversariosRepetidos.pares, "par", "pares")}, no máximo ${plural(aval.adversariosRepetidos.maxVezes, "vez", "vezes")} (o sorteio evita, mas pode acontecer).`
            : "Adversários repetidos: nenhum.",
          ` Jogos por semana: ${porSemana}.`),
        linhaEquilibrio(aval.equilibrio, confirmado));
    }

    function linhaEquilibrio(eq, confirmado) {
      if (!eq) {
        // Confirmado sem estrelas (campeonato de antes delas): o cadastro já travou, não dá mais para definir.
        return el("p", { class: "legenda", id: "equilibrio-calendario" }, confirmado
          ? "Equilíbrio por nível: não avaliado (o calendário foi confirmado sem as estrelas de todos os jogadores)."
          : "Equilíbrio por nível: defina as estrelas de todos os jogadores no passo Jogadores para ver.");
      }
      const saldo = eq.maiorSaldo ? `${eq.maiorSaldo.saldo > 0 ? "+" : ""}${eq.maiorSaldo.saldo} (${eq.maiorSaldo.nome})` : "0";
      const total = eq.aceitaveis + eq.foraDoAceitavel;
      return el("p", { class: `equilibrio${eq.foraDoAceitavel ? " alerta" : ""}`, id: "equilibrio-calendario" },
        el("strong", {}, "Equilíbrio por nível: "),
        `${eq.aceitaveis} de ${plural(total, "jogo aceitável", "jogos aceitáveis")} (diferença de até ${plural(Regras.DIFERENCA_ACEITAVEL, "estrela", "estrelas")}; ${eq.perfeitos} sem diferença)`,
        eq.foraDoAceitavel ? `, ${eq.foraDoAceitavel} fora do aceitável (maior diferença: ${eq.maiorDiferenca})` : "",
        `. Maior saldo de estrelas na temporada: ${saldo}.`);
    }

    function renderizarCalendario(atual) {
      const camp = atual.campeonato;
      const confirmado = Regras.cadastroTravado(camp, atual.jogos);
      const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
      const rascunho = !confirmado && camp.sorteio ? camp.sorteio.rascunho || null : null;
      nivelPorId = new Map(camp.jogadores.map((j) => [j.id, j.estrelas]));
      if (editandoSlot && (!rascunho || !rascunho[editandoSlot.indice])) editandoSlot = null;

      resumo.textContent = confirmado ? `confirmado · ${plural(atual.jogos.length, "jogo", "jogos")}` : rascunho ? "sorteio em análise" : "";

      const calendario = confirmado ? atual.jogos : rascunho;

      if (!calendario) {
        const explicacao = el("p", { class: "legenda" },
          "Sorteia as duplas e os jogos de todas as semanas de uma vez: todos com o mesmo número de jogos, no máximo um por semana e sem repetir parceiro. "
          + "Também equilibra os jogos pelo nível (estrelas) de cada jogador. Depois você pode trocar jogadores à mão e confirmar.");
        const botaoSortear = el("button", { type: "button", id: "btn-sortear", class: "primario", disabled: !diag.pronto, onclick: sortear },
          Icones.svg("sortear"), "Sortear calendário");
        if (diag.pronto) {
          alvo.replaceChildren(explicacao, botaoSortear);
        } else {
          alvo.replaceChildren(explicacao,
            el("ul", { class: "avisos-chave" }, itemAlerta("Antes de sortear, ajuste o cadastro:"),
              diag.problemas.map((p) => el("li", { class: "sem-icone" }, p))),
            el("div", { class: "acoes-calendario" }, botaoSortear,
              el("button", { type: "button", dataset: { ir: "jogadores" }, onclick: () => app.irParaAba("jogadores") }, "Ir para Jogadores")));
        }
        return;
      }

      const aval = Regras.avaliarCalendario(camp.jogadores, calendario, camp.config);
      const semanas = Array.from({ length: camp.config.semanas }, (_, i) => i + 1);
      alvo.replaceChildren(
        confirmado
          ? el("p", { class: "legenda" }, `Calendário confirmado${camp.sorteio ? ` (semente ${camp.sorteio.semente})` : ""}. Os jogos são lançados na aba Rodadas.`)
          : el("div", { class: "acoes-calendario" },
              el("button", { type: "button", id: "btn-sortear", onclick: sortear }, Icones.svg("sortear"), "Sortear de novo"),
              el("button", { type: "button", id: "btn-confirmar-calendario", class: "primario", onclick: confirmarCalendario },
                Icones.svg("confirmar"), "Confirmar calendário"),
              el("button", { type: "button", id: "btn-descartar-sorteio", class: "discreto", onclick: descartarSorteio }, "Descartar"),
              el("span", { class: "legenda" }, `Semente do sorteio: ${camp.sorteio.semente}. Clique num nome para trocar o jogador.`)),
        painelQualidade(aval, camp.config, confirmado),
        el("div", { class: "semanas-calendario" },
          semanas.map((n) => semanaDoCalendario(calendario, n, !confirmado, aval.equilibrio && aval.equilibrio.porJogo))));
    }

    return {
      renderizar: renderizarCalendario,
      limparRascunhos() { editandoSlot = null; },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, sorteio: { criar } };
})();
