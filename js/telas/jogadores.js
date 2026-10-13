// Tela "Jogadores" (passo 2 da preparação): cadastro (adicionar, renomear, remover) e nível
// (estrelas) de cada jogador. Nome, jogos, semanas e aparência ficam na tela Configuração.

(function () {
  "use strict";

  const { el, buscar, plural, botaoIcone } = Util;

  const comMaiuscula = (texto) => texto[0].toUpperCase() + texto.slice(1);

  function criar(app, raiz) {
    const { estado, nomePorId, avisar, renderizar, cadastroTravado } = app;

    const resumo = el("span", { id: "resumo-jogadores", class: "contador" });
    const conteudo = el("div", { id: "conteudo-jogadores" });
    raiz.append(el("section", { id: "tela-jogadores", class: "tela" },
      el("div", { class: "tela-cabecalho" }, el("h2", {}, "Jogadores ", resumo)),
      conteudo));

    let rascunhoNomes = ""; // nomes digitados/colados e ainda não adicionados
    let renomeando = null; // { id, valor } do jogador em edição
    // Erros mostrados embaixo do campo: id do campo -> { mensagem, valor? } (valor = o texto
    // recusado, que continua no campo para corrigir). Some quando o campo recebe um valor válido.
    const errosCampo = new Map();

    // Campos que validam ao sair (change) não puxam o foco de volta: o Tab segue normalmente.
    function marcarErro(id, mensagem, valor, { focar = false } = {}) {
      errosCampo.set(id, { mensagem, valor });
      if (focar) app.focarDepois(id);
      renderizar();
    }
    const idErro = (id) => `${id}-erro`;
    const mensagemDe = (id) => (errosCampo.get(id) || {}).mensagem;
    const atributosDeErro = (id) => Util.atributosDeErro(idErro(id), mensagemDe(id));
    const mensagemDeErro = (id) => Util.mensagemDeErro(idErro(id), mensagemDe(id));

    function adicionarNomes() {
      if (cadastroTravado()) return;
      const campo = buscar(raiz, "novos-nomes");
      const nomes = Regras.interpretarListaNomes(campo ? campo.value : rascunhoNomes);
      if (!nomes.length) {
        marcarErro("novos-nomes", "Digite ao menos um nome (um por linha).", undefined, { focar: true });
        return;
      }
      const r = Regras.adicionarJogadores(estado.atual().campeonato.jogadores, nomes);
      rascunhoNomes = r.ignorados.map((i) => i.nome).join("\n"); // o que falhou fica no campo para corrigir
      if (r.ignorados.length) {
        errosCampo.set("novos-nomes", { mensagem: r.ignorados.map((i) => `"${i.nome}" não foi adicionado: ${i.motivo}`).join("\n") });
      } else {
        errosCampo.delete("novos-nomes");
      }
      app.focarDepois("novos-nomes");
      if (!r.adicionados.length) {
        renderizar();
        return;
      }
      estado.modificar(`adicionar jogadores: ${r.adicionados.join(", ")}`, (s) => {
        s.campeonato.jogadores = r.jogadores;
        s.campeonato.sorteio = null;
      });
      avisar(`${plural(r.adicionados.length, "jogador adicionado", "jogadores adicionados")}.`);
    }

    function removerDoCadastro(id) {
      if (cadastroTravado()) return;
      const nome = nomePorId.get(id);
      estado.modificar(`remover jogador ${nome}`, (s) => {
        s.campeonato.jogadores = Regras.removerJogador(s.campeonato.jogadores, id);
        s.campeonato.sorteio = null;
      });
    }

    function salvarRenomeacao() {
      if (!renomeando) return;
      const { id } = renomeando;
      const campo = buscar(raiz, `nome-${id}`);
      const valor = campo ? campo.value : renomeando.valor;
      const r = Regras.renomearJogador(estado.atual().campeonato.jogadores, id, valor);
      if (r.erro) {
        renomeando.valor = valor;
        marcarErro(`nome-${id}`, comMaiuscula(r.erro), undefined, { focar: true });
        return;
      }
      const antigo = nomePorId.get(id);
      errosCampo.delete(`nome-${id}`);
      renomeando = null;
      if (!estado.modificar(`renomear ${antigo} para ${r.jogadores.find((j) => j.id === id).nome}`, (s) => {
        s.campeonato.jogadores = r.jogadores;
      })) {
        renderizar();
      }
    }

    // Estrelas entram no desfazer e não descartam o rascunho do sorteio (o painel de equilíbrio
    // do calendário só é recalculado).
    function definirNivel(id, estrelas) {
      if (cadastroTravado()) return;
      const r = Regras.definirEstrelas(estado.atual().campeonato.jogadores, id, estrelas);
      if (r.erro) { avisar(r.erro, "erro"); return; }
      if (!estado.modificar(`estrelas de ${nomePorId.get(id)}: ${estrelas}`, (s) => { s.campeonato.jogadores = r.jogadores; })) renderizar();
    }

    function seletorDeEstrelas(jogador, travado) {
      const valor = jogador.estrelas;
      const rotulo = Regras.validarEstrelas(valor) ? `${valor} estrela${valor > 1 ? "s" : ""}` : "sem nível definido";
      if (travado) {
        return el("span", { class: "estrelas fixas", role: "img", "aria-label": `Nível de ${jogador.nome}: ${rotulo}`, title: rotulo },
          Array.from({ length: Regras.ESTRELAS_MAX }, (_, i) => el("span", { class: `estrela${i < valor ? " cheia" : ""}` }, Icones.svg("estrela"))));
      }
      return el("span", { class: "estrelas", role: "group", "aria-label": `Nível de ${jogador.nome}`, title: rotulo },
        Array.from({ length: Regras.ESTRELAS_MAX }, (_, i) => {
          const n = i + 1;
          return el("button", {
            type: "button", id: `estrela-${jogador.id}-${n}`, class: `estrela${n <= valor ? " cheia" : ""}`,
            "aria-label": `${n} estrela${n > 1 ? "s" : ""}`, "aria-pressed": String(n === valor),
            onclick: () => definirNivel(jogador.id, n),
          }, Icones.svg("estrela"));
        }));
    }

    function itemJogador(jogador, travado) {
      if (renomeando && renomeando.id === jogador.id) {
        const idCampo = `nome-${jogador.id}`;
        const cancelar = () => { renomeando = null; errosCampo.delete(idCampo); renderizar(); };
        return el("li", { class: "jogador editando" },
          el("input", {
            id: idCampo, type: "text", maxlength: String(Regras.MAX_CARACTERES_NOME), autocomplete: "off",
            value: renomeando.valor, "aria-label": `Novo nome de ${jogador.nome}`, ...atributosDeErro(idCampo),
            oninput: (ev) => { renomeando.valor = ev.target.value; },
            onkeydown: (ev) => {
              if (ev.key === "Enter") { ev.preventDefault(); salvarRenomeacao(); }
              else if (ev.key === "Escape") cancelar();
            },
            onfocus: (ev) => ev.target.select(),
          }),
          el("button", { type: "button", id: `salvar-nome-${jogador.id}`, class: "primario mini", onclick: salvarRenomeacao }, "Salvar"),
          el("button", { type: "button", class: "discreto mini", onclick: cancelar }, "Cancelar"),
          mensagemDeErro(idCampo));
      }
      const semNivel = !Regras.validarEstrelas(jogador.estrelas);
      return el("li", { class: `jogador${semNivel ? " sem-estrelas" : ""}`, id: `jogador-${jogador.id}` },
        el("span", { class: "nome-jogador" }, jogador.nome),
        seletorDeEstrelas(jogador, travado),
        botaoIcone({
          icone: "editar", rotulo: `Renomear ${jogador.nome}`, id: `renomear-${jogador.id}`, class: "discreto mini",
          onclick: () => { renomeando = { id: jogador.id, valor: jogador.nome }; app.focarDepois(`nome-${jogador.id}`); renderizar(); },
        }),
        !travado && botaoIcone({
          icone: "remover", rotulo: `Remover ${jogador.nome}`, id: `remover-${jogador.id}`, class: "discreto mini perigo",
          onclick: () => removerDoCadastro(jogador.id),
        }));
    }

    function renderizarJogadores(atual) {
      const camp = atual.campeonato;
      const travado = Regras.cadastroTravado(camp, atual.jogos);
      const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
      if (renomeando && !camp.jogadores.some((j) => j.id === renomeando.id)) renomeando = null;

      const semNivel = Regras.jogadoresSemEstrelas(camp.jogadores).length;
      resumo.textContent =
        `${plural(diag.jogadores, "jogador", "jogadores")}${travado ? " · calendário confirmado" : semNivel ? ` · ${semNivel} sem estrelas` : ""}`;

      // replaceChildren não descarta os false (como el() faz): filtra antes.
      conteudo.replaceChildren(...[
        travado ? null : diag.pronto
          ? el("p", { class: "tudo-certo" }, Icones.svg("ok"), "Combinação válida para sortear o calendário.",
              el("button", {
                type: "button", id: "btn-proximo-sorteio", class: "primario mini", dataset: { ir: "sorteio" }, onclick: () => app.irParaAba("sorteio"),
              }, "Próximo: sortear o calendário", Icones.svg("seguir")))
          : el("ul", { class: "avisos-chave" }, diag.problemas.map((p) => el("li", {}, Icones.svg("alerta"), el("span", {}, p)))),
        travado
          ? el("div", { class: "alerta" },
              "Calendário confirmado: só é possível renomear jogadores. Para mudar a lista, reinicie o campeonato "
              + "(exporte um backup antes). O botão fica em Ajustes, na zona de perigo.")
          : el("div", { class: "adicionar-jogadores" },
              el("label", { for: "novos-nomes" }, "Adicionar jogadores (um nome por linha; Ctrl+Enter adiciona)"),
              el("textarea", {
                id: "novos-nomes", rows: "3", placeholder: "Jogador 1\nJogador 2\nJogador 3", ...atributosDeErro("novos-nomes"),
                oninput: (ev) => { rascunhoNomes = ev.target.value; },
                onkeydown: (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); adicionarNomes(); } },
              }, rascunhoNomes),
              mensagemDeErro("novos-nomes"),
              el("div", { class: "acoes" },
                el("button", { type: "button", id: "btn-adicionar-nomes", class: "primario", onclick: adicionarNomes }, "Adicionar"))),
        camp.jogadores.length > 0 && el("p", { class: "legenda", id: "legenda-estrelas" },
          Icones.svg("estrela"),
          " Nível de 1 a 5 estrelas: usado só para equilibrar o sorteio. Só você vê (não aparece no telão, nas imagens nem na classificação)."),
        camp.jogadores.length
          ? el("ol", { class: "lista-jogadores", id: "lista-jogadores" }, camp.jogadores.map((j) => itemJogador(j, travado)))
          : app.proximoPasso("Nenhum jogador cadastrado ainda. Cole os nomes no campo acima, um por linha, e clique em \"Adicionar\"."),
      ].filter(Boolean));
    }

    return {
      renderizar: renderizarJogadores,
      limparRascunhos() {
        renomeando = null;
        errosCampo.clear();
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, jogadores: { criar } };
})();
