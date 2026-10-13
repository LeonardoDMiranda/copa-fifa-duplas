// Tela "Campeonato e jogadores": nome, configuração, aparência (cor e logo) e cadastro
// (adicionar, renomear, remover).

(function () {
  "use strict";

  const { el, buscar, plural, botaoIcone } = Util;
  const COR_PADRAO = "#0d3b66"; // azul do cabeçalho (--topo)

  const comMaiuscula = (texto) => texto[0].toUpperCase() + texto.slice(1);

  function criar(app, raiz) {
    const { estado, nomePorId, avisar, renderizar, cadastroTravado } = app;

    const resumo = el("span", { id: "resumo-jogadores", class: "contador" });
    const conteudo = el("div", { id: "conteudo-jogadores" });
    raiz.append(el("section", { id: "tela-jogadores", class: "tela" },
      el("div", { class: "tela-cabecalho" }, el("h2", {}, "Campeonato e jogadores ", resumo)),
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
    // Valor do campo: o recusado (se houver erro) ou o guardado.
    const valorDo = (id, guardado) => (errosCampo.has(id) && errosCampo.get(id).valor !== undefined ? errosCampo.get(id).valor : guardado);

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

    function mudarNomeDoCampeonato(ev) {
      const nome = Regras.normalizarNome(ev.target.value);
      if (!nome) {
        marcarErro("nome-campeonato", "O nome do campeonato não pode ficar vazio.", ev.target.value);
        return;
      }
      errosCampo.delete("nome-campeonato");
      if (!estado.modificar("nome do campeonato", (s) => { s.campeonato.nome = nome; })) renderizar();
    }

    function mudarConfigInteira(id, campo, rotulo, texto) {
      if (cadastroTravado()) return;
      const t = texto.trim();
      const nova = { ...app.config(), [campo]: /^\d+$/.test(t) ? Number(t) : NaN };
      const erro = !(nova[campo] >= 1 && nova[campo] <= 99) ? "use um número de 1 a 99." : Regras.validarConfig(nova);
      if (erro) {
        marcarErro(id, comMaiuscula(erro), texto);
        return;
      }
      errosCampo.delete(id);
      if (!estado.modificar(`${rotulo}: ${nova[campo]}`, (s) => {
        s.campeonato.config = nova;
        s.campeonato.sorteio = null;
      })) {
        renderizar();
      }
    }

    // Cor e logo valem na hora e ficam fora do desfazer (ver Estado.definirAparencia).
    function definirAparencia(parcial, mensagem) {
      if (estado.definirAparencia({ ...(estado.aparencia() || {}), ...parcial })) avisar(mensagem);
    }

    function mudarCor(ev) {
      const cor = ev.target.value.toLowerCase();
      if (!Util.corLegivelComBranco(cor)) {
        const c = Util.numero(Util.contraste(cor, "#ffffff"), 1);
        marcarErro("aparencia-cor",
          `Cor clara demais: o texto branco do cabeçalho ficaria ilegível (contraste ${c}:1; o mínimo é ${Util.numero(Util.CONTRASTE_MINIMO, 1)}:1). Escolha uma mais escura.`,
          cor);
        return;
      }
      errosCampo.delete("aparencia-cor");
      definirAparencia({ cor }, "Cor do campeonato atualizada.");
    }

    async function escolherLogo(ev) {
      const arquivo = ev.target.files[0];
      ev.target.value = "";
      if (!arquivo) return;
      try {
        const logo = await Util.prepararLogo(arquivo);
        errosCampo.delete("aparencia-logo-escolher");
        definirAparencia({ logo }, "Logo do campeonato atualizado.");
      } catch (erro) {
        marcarErro("aparencia-logo-escolher", `Não foi possível usar a imagem: ${erro.message}`);
      }
    }

    function blocoAparencia() {
      const ap = estado.aparencia() || {};
      return el("div", { class: "aparencia", id: "aparencia" },
        el("span", { class: "rotulo-aparencia" }, "Aparência"),
        el("label", { class: "campo-aparencia" }, "Cor",
          el("input", {
            id: "aparencia-cor", type: "color", value: valorDo("aparencia-cor", ap.cor || COR_PADRAO), onchange: mudarCor,
            ...atributosDeErro("aparencia-cor"),
          })),
        ap.cor && el("button", {
          type: "button", id: "aparencia-cor-padrao", class: "discreto mini", title: "Voltar ao azul padrão",
          onclick: () => { errosCampo.delete("aparencia-cor"); definirAparencia({ cor: null }, "Cor padrão restaurada."); },
        }, "Padrão"),
        el("span", { class: "campo-aparencia" }, "Logo",
          ap.logo ? el("img", { class: "previa-logo", id: "previa-logo", src: ap.logo, alt: "Logo do campeonato" }) : el("span", { class: "sem-logo" }, "nenhum"),
          el("button", {
            type: "button", id: "aparencia-logo-escolher", class: "mini", title: "Imagem PNG, JPG ou WebP; é reduzida para caber em 256×128",
            onclick: () => buscar(raiz, "aparencia-logo-arquivo").click(),
            ...atributosDeErro("aparencia-logo-escolher"),
          }, ap.logo ? "Trocar" : "Escolher imagem"),
          ap.logo && el("button", {
            type: "button", id: "aparencia-logo-remover", class: "discreto mini perigo",
            onclick: () => definirAparencia({ logo: null }, "Logo removido."),
          }, "Remover"),
          el("input", { id: "aparencia-logo-arquivo", type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: escolherLogo })),
        mensagemDeErro("aparencia-cor"),
        mensagemDeErro("aparencia-logo-escolher"),
        el("span", { class: "legenda" }, "No cabeçalho, no telão e nos PNGs. Não entra no \"Desfazer\"."));
    }

    // Rótulo em cima, campo e, se houver, o erro embaixo.
    function campoConfig(classe, rotulo, entrada) {
      return el("div", { class: `campo-config ${classe}` },
        el("label", { for: entrada.id }, rotulo), entrada, mensagemDeErro(entrada.id));
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

      const porSemana = diag.jogosPorSemanaMin === diag.jogosPorSemanaMax
        ? `${diag.jogosPorSemanaMax}` : `${diag.jogosPorSemanaMin} a ${diag.jogosPorSemanaMax}`;
      const numero = (id, campo, rotulo) => el("input", {
        id, type: "text", inputmode: "numeric", maxlength: "2", autocomplete: "off",
        value: valorDo(id, String(camp.config[campo])), disabled: travado, ...atributosDeErro(id),
        onchange: (ev) => mudarConfigInteira(id, campo, rotulo, ev.target.value),
        onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
        onfocus: (ev) => ev.target.select(),
      });

      // replaceChildren não descarta os false (como el() faz): filtra antes.
      conteudo.replaceChildren(...[
        el("div", { class: "config-campeonato" },
          campoConfig("nome", "Nome do campeonato", el("input", {
            id: "nome-campeonato", type: "text", maxlength: "60", autocomplete: "off", value: valorDo("nome-campeonato", camp.nome),
            ...atributosDeErro("nome-campeonato"),
            onchange: mudarNomeDoCampeonato,
            onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
          })),
          campoConfig("numero", "Jogos por jogador", numero("config-jogos", "jogosPorJogador", "Jogos por jogador")),
          campoConfig("numero", "Semanas", numero("config-semanas", "semanas", "Semanas"))),
        blocoAparencia(),
        el("p", { class: "diagnostico", id: "diagnostico" },
          `${plural(diag.jogadores, "jogador", "jogadores")} × ${plural(camp.config.jogosPorJogador, "jogo", "jogos")} ÷ 4 = ${plural(diag.totalJogos, "jogo", "jogos")} · ${porSemana} por semana em ${plural(camp.config.semanas, "semana", "semanas")}`),
        diag.pronto
          ? el("p", { class: "tudo-certo" }, Icones.svg("ok"), "Combinação válida para sortear o calendário.",
              !travado && el("button", {
                type: "button", class: "primario mini", dataset: { ir: "calendario" }, onclick: () => app.irParaAba("calendario"),
              }, "Próximo: sortear o calendário", Icones.svg("seguir")))
          : el("ul", { class: "avisos-chave" }, diag.problemas.map((p) => el("li", {}, Icones.svg("alerta"), el("span", {}, p)))),
        travado
          ? el("div", { class: "alerta" },
              "Calendário confirmado: só é possível renomear jogadores. Para mudar a lista, reinicie o campeonato (exporte um backup antes).",
              el("button", { type: "button", id: "btn-reiniciar", class: "perigo", onclick: app.resetar }, "Reiniciar campeonato"))
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
