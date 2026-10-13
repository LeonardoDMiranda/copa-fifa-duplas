// Tela "Campeonatos" (index.html#campeonatos, fora das abas de etapa): as edições guardadas no
// navegador, com abrir, duplicar, arquivar/desarquivar, exportar (backup ou modelo) e excluir,
// criar a partir de um modelo, e o espaço usado.

(function () {
  "use strict";

  const { el, plural } = Util;

  function formatarData(iso) {
    return iso ? new Date(iso).toLocaleDateString("pt-BR") : "data desconhecida";
  }

  function formatarTamanho(bytes) {
    return bytes >= 1024 * 1024 ? `${Util.numero(bytes / (1024 * 1024), 1)} MB` : `${Util.numero(Math.ceil(bytes / 1024))} KB`;
  }

  function criar(app, raiz) {
    const { campeonatos, avisar } = app;

    const resumo = el("span", { id: "resumo-campeonatos", class: "contador" });
    const conteudo = el("div", { id: "conteudo-campeonatos" });
    raiz.append(el("section", { id: "tela-campeonatos", class: "tela" },
      el("div", { class: "tela-cabecalho" },
        el("h2", { id: "titulo-tela-campeonatos" }, "Campeonatos ", resumo),
        el("p", { class: "legenda" },
          "Cada edição guarda os seus jogadores, calendário, placares, mata-mata e desfazer. O campeonato aberto vale "
          + "para todas as janelas do app neste navegador (inclusive o telão). Para passar a outra pessoa, exporte o backup.")),
      conteudo));

    // Toda ação passa por aqui: erro vira aviso e, se a ativa mudou, o app carrega a nova.
    function executar(acao, aposMudar) {
      try {
        const r = acao();
        app.sincronizarEdicao(aposMudar);
        return r;
      } catch (erro) {
        avisar(`Não foi possível: ${erro.message}`, "erro");
        app.renderizar();
        return undefined;
      }
    }

    function abrir(c) {
      if (executar(() => { campeonatos.abrir(c.id); return true; }, "etapa")) avisar(`Campeonato aberto: ${c.nome}`);
    }

    function duplicar(c) {
      if (executar(() => campeonatos.duplicar(c.id), "configuracao")) {
        app.focarDepois("nome-campeonato", { selecionar: true });
        avisar(`Nova edição criada a partir de "${c.nome}", com a mesma configuração e os mesmos jogadores.`);
      }
    }

    function arquivar(c) {
      if (executar(() => { campeonatos.arquivar(c.id); return true; }, null)) {
        avisar(`Arquivado: ${c.nome}. O histórico do desfazer dele foi apagado para poupar espaço.`);
      }
    }

    function desarquivar(c) {
      if (executar(() => { campeonatos.desarquivar(c.id); return true; }, null)) avisar(`Desarquivado: ${c.nome}`);
    }

    async function excluir(c) {
      const ok = await Util.confirmar(
        `Apaga "${c.nome}" deste navegador: jogadores, calendário, placares, desempates e mata-mata.\n\n`
        + "Não dá para desfazer. Se quiser guardar os dados, exporte um backup antes.",
        {
          titulo: "Excluir o campeonato?", acao: "Excluir", perigo: true,
          extras: [{ id: "dialogo-exportar-antes", rotulo: [Icones.svg("baixar"), "Exportar backup antes"], aoClicar: () => app.exportarEdicao(c.id) }],
        }
      );
      if (!ok) return;
      if (executar(() => { campeonatos.excluir(c.id); return true; }, null)) avisar(`Excluído: ${c.nome}`);
    }

    function botao(id, rotulo, titulo, onclick, extra = {}) {
      return el("button", { type: "button", id, class: `mini ${extra.classe || ""}`.trim(), title: titulo, disabled: extra.disabled, onclick }, rotulo);
    }

    // Botão de item do menu ⋯ do cartão (mesmo estilo dos menus do cabeçalho).
    function itemMenu(id, icone, rotulo, titulo, onclick, extra = {}) {
      return el("button", { type: "button", id, class: extra.classe || null, title: titulo, disabled: extra.disabled, onclick },
        Icones.svg(icone), rotulo);
    }

    function menuDoCartao(c, invalido) {
      return el("details", { class: "menu-cartao", id: `campeonato-menu-${c.id}` },
        el("summary", { class: "mini", "aria-label": `Mais ações de ${c.nome}`, title: "Mais ações" }, Icones.svg("mais")),
        el("div", { class: "menu-itens" },
          itemMenu(`campeonato-duplicar-${c.id}`, "novo", "Duplicar", "Nova edição com o mesmo nome (2), configuração e jogadores; sem calendário nem jogos",
            () => duplicar(c), { disabled: invalido }),
          itemMenu(`campeonato-exportar-${c.id}`, "baixar", "Exportar backup", "Baixar o backup em JSON desta edição",
            () => app.exportarEdicao(c.id), { disabled: invalido }),
          itemMenu(`campeonato-modelo-${c.id}`, "baixar", "Exportar modelo",
            "Baixar um modelo (nome, configuração, jogadores, cor e logo) para outro organizador ou outra edição",
            () => app.exportarModelo(c.id), { disabled: invalido }),
          !c.arquivado && itemMenu(`campeonato-arquivar-${c.id}`, "backup", "Arquivar",
            "Tira do seletor e apaga o histórico do desfazer desta edição", () => arquivar(c)),
          el("hr"),
          itemMenu(`campeonato-excluir-${c.id}`, "remover", "Excluir", "Apagar esta edição do navegador (sem desfazer)",
            () => excluir(c), { classe: "perigo" })));
    }

    function itemCampeonato(c) {
      const invalido = c.situacao.etapa === "invalido";
      return el("li", { class: `item-campeonato${c.ativo ? " ativo" : ""}`, id: `campeonato-${c.id}` },
        el("div", { class: "item-campeonato-texto" },
          el("span", { class: "titulo-edicao" }, c.nome, c.ativo && el("span", { class: "tag-ativo" }, "aberto")),
          el("span", { class: `situacao etapa-${c.situacao.etapa}` }, c.situacao.texto),
          el("span", { class: "detalhe-edicao" }, `${plural(c.jogadores, "jogador", "jogadores")} · criado em ${formatarData(c.criadoEm)}`)),
        el("div", { class: "item-campeonato-acoes" },
          !c.arquivado && !c.ativo && botao(`campeonato-abrir-${c.id}`, "Abrir", `Trabalhar em "${c.nome}"`, () => abrir(c), { classe: "primario" }),
          c.arquivado && botao(`campeonato-desarquivar-${c.id}`, "Desarquivar", "Volta para a lista do seletor", () => desarquivar(c)),
          menuDoCartao(c, invalido)));
    }

    // Menus ⋯ dos cartões: um só aberto por vez; fecham ao escolher um item, ao clicar fora e com Esc.
    function menusAbertos() {
      return [...raiz.querySelectorAll("details.menu-cartao[open]")];
    }
    raiz.addEventListener("toggle", (ev) => {
      if (ev.target.open) for (const m of menusAbertos()) if (m !== ev.target) m.open = false;
    }, true);
    raiz.addEventListener("click", (ev) => {
      if (ev.target.closest(".menu-itens button")) for (const m of menusAbertos()) m.open = false;
    });
    raiz.ownerDocument.addEventListener("click", (ev) => {
      for (const m of menusAbertos()) if (!m.contains(ev.target)) m.open = false;
    });
    raiz.addEventListener("keydown", (ev) => {
      const aberto = ev.key === "Escape" && menusAbertos()[0];
      if (!aberto) return;
      ev.stopPropagation();
      aberto.open = false;
      aberto.querySelector("summary").focus();
    });

    function renderizar() {
      const lista = campeonatos.listar();
      const ativos = lista.filter((c) => !c.arquivado);
      const arquivados = lista.filter((c) => c.arquivado);
      const espaco = campeonatos.espacoUsado();
      const pct = Math.round((espaco.bytes / espaco.limite) * 100);
      resumo.textContent =
        `${ativos.length} em uso${arquivados.length ? ` · ${plural(arquivados.length, "arquivado", "arquivados")}` : ""}`;
      // replaceChildren não descarta os false (como el() faz): filtra antes.
      conteudo.replaceChildren(...[
        el("div", { class: "acoes-campeonatos" },
          el("button", { type: "button", id: "btn-campeonato-novo", class: "primario", onclick: app.novoCampeonato }, Icones.svg("novo"), "Novo campeonato"),
          el("button", {
            type: "button", id: "btn-campeonato-de-modelo", title: "Escolher um arquivo de modelo (…-modelo.json)",
            onclick: app.escolherArquivoParaImportar,
          }, Icones.svg("novo"), "Novo a partir de modelo")),
        el("ul", { class: "lista-campeonatos", id: "lista-campeonatos" }, ativos.map(itemCampeonato)),
        arquivados.length > 0 && el("h3", { class: "titulo-arquivados" }, "Arquivados"),
        arquivados.length > 0 && el("ul", { class: "lista-campeonatos arquivados", id: "lista-arquivados" }, arquivados.map(itemCampeonato)),
        el("div", { class: `espaco-usado${pct >= 80 ? " cheio" : ""}`, id: "espaco-usado" },
          el("label", { for: "barra-espaco" },
            `Espaço usado no navegador: ${formatarTamanho(espaco.bytes)} de ~${formatarTamanho(espaco.limite)} (${pct}%).`,
            pct >= 80 ? " Arquive ou exclua edições antigas (exporte o backup antes)." : ""),
          el("progress", { id: "barra-espaco", max: 100, value: Math.min(pct, 100) })),
      ].filter(Boolean));
    }

    return { renderizar };
  }

  globalThis.Telas = { ...globalThis.Telas, campeonatos: { criar } };
})();
