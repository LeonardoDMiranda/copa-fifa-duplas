// Tela "Campeonatos" (index.html#campeonatos, fora das abas de etapa): as edições guardadas no
// navegador, com abrir, duplicar, arquivar/desarquivar, exportar (backup ou modelo) e excluir,
// criar a partir de um modelo, e o espaço usado.

(function () {
  "use strict";

  const { el } = Util;

  function formatarData(iso) {
    return iso ? new Date(iso).toLocaleDateString("pt-BR") : "data desconhecida";
  }

  function formatarTamanho(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  function criar(app) {
    const { campeonatos, avisar } = app;

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
      if (executar(() => campeonatos.duplicar(c.id), "jogadores")) {
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
          extras: [{ id: "dialogo-exportar-antes", rotulo: "⬇ Exportar backup antes", aoClicar: () => app.exportarEdicao(c.id) }],
        }
      );
      if (!ok) return;
      if (executar(() => { campeonatos.excluir(c.id); return true; }, null)) avisar(`Excluído: ${c.nome}`);
    }

    function botao(id, rotulo, titulo, onclick, extra = {}) {
      return el("button", { type: "button", id, class: `mini ${extra.classe || ""}`.trim(), title: titulo, disabled: extra.disabled, onclick }, rotulo);
    }

    function itemCampeonato(c) {
      const invalido = c.situacao.etapa === "invalido";
      return el("li", { class: `item-campeonato${c.ativo ? " ativo" : ""}`, id: `campeonato-${c.id}` },
        el("div", { class: "item-campeonato-texto" },
          el("span", { class: "titulo-edicao" }, c.nome, c.ativo && el("span", { class: "tag-ativo" }, "aberto")),
          el("span", { class: `situacao etapa-${c.situacao.etapa}` },
            `${c.situacao.texto} · ${c.jogadores} jogador(es) · criado em ${formatarData(c.criadoEm)}`)),
        el("div", { class: "item-campeonato-acoes" },
          !c.arquivado && !c.ativo && botao(`campeonato-abrir-${c.id}`, "Abrir", `Trabalhar em "${c.nome}"`, () => abrir(c), { classe: "primario" }),
          botao(`campeonato-duplicar-${c.id}`, "Duplicar", "Nova edição com o mesmo nome (2), configuração e jogadores; sem calendário nem jogos",
            () => duplicar(c), { disabled: invalido }),
          botao(`campeonato-exportar-${c.id}`, "⬇ Exportar", "Baixar o backup em JSON desta edição", () => app.exportarEdicao(c.id), { disabled: invalido }),
          botao(`campeonato-modelo-${c.id}`, "⬇ Modelo", "Baixar um modelo (nome, configuração, jogadores, cor e logo) para outro organizador ou outra edição",
            () => app.exportarModelo(c.id), { disabled: invalido }),
          c.arquivado
            ? botao(`campeonato-desarquivar-${c.id}`, "Desarquivar", "Volta para a lista do seletor", () => desarquivar(c))
            : botao(`campeonato-arquivar-${c.id}`, "Arquivar", "Tira do seletor e apaga o histórico do desfazer desta edição", () => arquivar(c)),
          botao(`campeonato-excluir-${c.id}`, "Excluir", "Apagar esta edição do navegador (sem desfazer)", () => excluir(c), { classe: "perigo" })));
    }

    function renderizar() {
      const lista = campeonatos.listar();
      const ativos = lista.filter((c) => !c.arquivado);
      const arquivados = lista.filter((c) => c.arquivado);
      const espaco = campeonatos.espacoUsado();
      const pct = Math.round((espaco.bytes / espaco.limite) * 100);
      document.getElementById("resumo-campeonatos").textContent =
        `${ativos.length} em uso${arquivados.length ? ` · ${arquivados.length} arquivado(s)` : ""}`;
      // replaceChildren não descarta os false (como el() faz): filtra antes.
      document.getElementById("conteudo-campeonatos").replaceChildren(...[
        el("div", { class: "acoes-campeonatos" },
          el("button", { type: "button", id: "btn-campeonato-novo", class: "primario", onclick: app.novoCampeonato }, "+ Novo campeonato"),
          el("button", {
            type: "button", id: "btn-campeonato-de-modelo", title: "Escolher um arquivo de modelo (…-modelo.json)",
            onclick: app.escolherArquivoParaImportar,
          }, "+ Novo a partir de modelo")),
        el("ul", { class: "lista-campeonatos", id: "lista-campeonatos" }, ativos.map(itemCampeonato)),
        arquivados.length > 0 && el("h3", { class: "titulo-arquivados" }, "Arquivados"),
        arquivados.length > 0 && el("ul", { class: "lista-campeonatos arquivados", id: "lista-arquivados" }, arquivados.map(itemCampeonato)),
        el("p", { class: `espaco-usado${pct >= 80 ? " cheio" : ""}`, id: "espaco-usado" },
          `Espaço usado no navegador: ${formatarTamanho(espaco.bytes)} de ~${formatarTamanho(espaco.limite)} (${pct}%).`,
          pct >= 80 ? " Arquive ou exclua edições antigas (exporte o backup antes)." : ""),
      ].filter(Boolean));
    }

    return { renderizar };
  }

  globalThis.Telas = { ...globalThis.Telas, campeonatos: { criar } };
})();
