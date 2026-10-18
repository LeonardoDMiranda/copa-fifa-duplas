// Tela "Mata-mata": chaveamento, placares com prorrogação e pênaltis, troca de duplas e pódio.
// Os nomes abrem a ficha do jogador (js/telas/ficha.js).

(function () {
  "use strict";

  const { el, buscar, confirmar, MAX_GOLS, lerGols, botaoIcone } = Util;

  const itemAlerta = (texto) => el("li", {}, Icones.svg("alerta"), el("span", {}, texto));

  const ROTULOS = Util.ROTULOS_MATA_MATA;
  const NOMES_CAMPO = {
    gols: "tempo normal", prorrogacao: "prorrogação", penaltis: "pênaltis",
  };

  function criar(app, raiz) {
    const { estado, renderizar, tabelaAtual, nomesDupla } = app;

    // "Nome + Nome", cada nome abrindo a ficha. `local` deixa os ids únicos na tela. Dupla incompleta
    // (vagas ímpares): o jogador que sobrou aparece com "sem dupla" no lugar do parceiro.
    const duplaComFicha = (dupla, local) => dupla.map((id, i) => [
      i ? " + " : null,
      id ? app.botaoJogador(id, `ver-${local}-${id}`) : el("em", { class: "sem-dupla" }, "sem dupla"),
    ]);

    const alvo = el("div", { id: "conteudo-mata-mata" });
    raiz.append(el("section", { id: "tela-mata-mata", class: "tela" },
      el("div", { class: "tela-cabecalho" },
        el("h2", {}, "Mata-mata"),
        el("p", { class: "legenda" },
          "Duplas vizinhas se enfrentam e os vencedores avançam · sem empate: prorrogação e, se preciso, pênaltis · ",
          Icones.svg("editar"), " troca uma dupla (surpresa da final). Não altera a classificação.")),
      alvo));

    const rascunhosMM = new Map(); // id do campo do mata-mata -> texto inválido digitado
    // Erros mostrados embaixo do campo: id do campo de placar (ou `editor-<chave>-<lado>` da troca de dupla) -> mensagem.
    const errosCampo = new Map();
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
      const cfg = atual.campeonato.config;
      const vagas = cfg.vagasFaseFinal;
      if (tabela.length < vagas) {
        return app.proximoPasso(`O chaveamento precisa de pelo menos ${vagas} jogadores cadastrados.`, "jogadores", "Ir para Jogadores");
      }
      const avisos = Regras.avisosParaGerarChaveamento(atual.jogos, tabela, cfg);
      // A prévia é o próprio chaveamento que seria gerado agora: só a 1ª rodada e quem folga.
      const previa = Regras.resolverMataMata(Regras.gerarMataMata(tabela, cfg), tabela, cfg);
      const primeira = previa.rodadas[0];
      const linhaPrevia = (c) => el("li", {},
        el("strong", {}, `${ROTULOS[c.chave]}: `),
        duplaComFicha(c.dupla1, `previa-${c.chave}-1`), ` (${c.origem[0]}) × `,
        duplaComFicha(c.dupla2, `previa-${c.chave}-2`), ` (${c.origem[1]})`);
      const linhaFolga = (f, i) => el("li", {}, duplaComFicha(f.dupla, `previa-folga-${i}`), ` (${f.origem})`);
      return el("div", { class: "gerar-chave" },
        el("p", {}, `Prévia pela classificação atual (${vagas} classificados, ${primeira.nome.toLowerCase()}):`),
        el("ul", { class: "previa" }, primeira.confrontos.map(linhaPrevia)),
        previa.folgam.length > 0 && el("div", {},
          el("p", { class: "legenda" }, `Folgam nesta rodada e entram na seguinte (${previa.folgam.length}):`),
          el("ul", { class: "previa", id: "previa-folgas" }, previa.folgam.map(linhaFolga))),
        vagas % 2 === 1 && el("p", { class: "legenda", id: "aviso-vagas-impares" }, Icones.svg("alerta"),
          `Com ${vagas} classificados, o ${(vagas + 1) / 2}º colocado fica sem dupla. Depois de gerar, escolha o parceiro dele em "Trocar a dupla"; `
          + "o confronto dele só abre quando a dupla estiver completa."),
        avisos.length
          ? el("ul", { class: "avisos-chave" }, avisos.map(itemAlerta))
          : el("p", { class: "tudo-certo" }, Icones.svg("ok"), `Todos os jogos lançados e nenhum empate técnico pendente no top ${vagas}.`),
        el("button", { type: "button", id: "btn-gerar-chave", class: "primario", onclick: gerarChaveamento }, "Gerar chaveamento"));
    }

    // Recalcula na hora do clique: um placar digitado logo antes pode ter mudado a classificação.
    async function gerarChaveamento() {
      const avisos = Regras.avisosParaGerarChaveamento(estado.atual().jogos, tabelaAtual(), app.config());
      if (avisos.length && !(await confirmar(`- ${avisos.join("\n- ")}`,
        { titulo: "Gerar o chaveamento mesmo assim?", acao: "Gerar mesmo assim", perigo: true }))) return;
      if (estado.atual().mataMata) return; // outra janela já gerou
      const tabela = tabelaAtual();
      estado.modificar("gerar chaveamento", (s) => { s.mataMata = Regras.gerarMataMata(tabela, app.config()); });
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
      const semis = mm.daClassificacao; // duplas que vêm da classificação (1ª rodada e quem folga)
      const finais = mm.dosResultados; // duplas que vêm dos vencedores/perdedores
      const desatualizado = semis.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
      const finaisDesatualizadas = finais.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
      return el("div", { class: "barra-mata-mata" },
        desatualizado && el("div", { class: "alerta" },
          Icones.svg("alerta"),
          "A classificação mudou depois de gerar o chaveamento: as duplas automáticas da classificação não batem mais com ela. ",
          el("button", {
            type: "button", id: "btn-atualizar-semis",
            onclick: async () => {
              if (!(await confirmarTrocaComPlacar(semis))) return;
              modificarMataMata("atualizar duplas das semis", (m) => Regras.atualizarDuplasDasSemis(m, tabelaAtual()));
            },
          }, "Usar duplas da classificação atual")),
        finaisDesatualizadas && el("div", { class: "alerta" },
          Icones.svg("alerta"),
          "O resultado de um confronto mudou depois de lançar placares dos seguintes: "
          + "as duplas que jogaram não são mais as que saem dos resultados. ",
          el("button", {
            type: "button", id: "btn-atualizar-finais",
            onclick: async () => {
              if (!(await confirmarTrocaComPlacar(finais))) return;
              modificarMataMata("atualizar duplas da final e do 3º lugar", (m) => Regras.atualizarDuplasDasFinais(m, tabelaAtual(), app.config()));
            },
          }, "Usar duplas que saem dos resultados")),
        el("div", { class: "barra-tela" },
          el("button", { type: "button", id: "btn-png-mata-mata", onclick: () => app.exportarPNG("mata-mata") },
            Icones.svg("imagem"), "Baixar imagem"),
          el("button", { type: "button", id: "btn-apagar-chave", class: "perigo discreto acao-direita", onclick: apagarChaveamento }, "Apagar chaveamento")));
    }

    function editorDupla(c, lado, tabela) {
      const info = c[`lado${lado}`];
      const atual = info.dupla || [null, null];
      const chaveErro = `editor-${c.chave}-${lado}`;
      const idErro = `${chaveErro}-erro`;
      const erro = errosCampo.get(chaveErro);
      const seletor = (n) => el("select", {
        id: `sel-${c.chave}-${lado}-${n}`, "aria-label": `${ROTULOS[c.chave]}, dupla ${lado}, jogador ${n}`, ...Util.atributosDeErro(idErro, erro),
      },
        el("option", { value: "" }, "Jogador"),
        tabela.map((l) => el("option", { value: l.id, selected: l.id === atual[n - 1] }, `${l.posicao}º ${l.nome}`)));
      const sel1 = seletor(1), sel2 = seletor(2);
      const fechar = () => { editandoDupla = null; errosCampo.delete(chaveErro); };

      const salvar = () => {
        const dupla = [sel1.value, sel2.value];
        // A outra dupla pode estar incompleta (jogador sem parceiro): ela só vale na checagem se estiver inteira.
        const outraDupla = c[`dupla${3 - lado}`];
        const outra = Regras.duplaCompleta(outraDupla) ? outraDupla : null;
        const erroDupla = lado === 1 ? Regras.validarDuplas(dupla, outra) : Regras.validarDuplas(outra, dupla);
        if (erroDupla) {
          errosCampo.set(chaveErro, erroDupla);
          app.focarDepois(sel1.id);
          renderizar();
          return;
        }
        fechar();
        modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} = ${nomesDupla(dupla)}`,
          (m) => Regras.definirDupla(m, c.chave, lado, dupla));
      };
      const voltar = () => {
        fechar();
        modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} volta à automática`,
          (m) => Regras.voltarDuplaAutomatica(m, c.chave, lado, tabelaAtual()));
      };

      return el("div", { class: "editor-dupla" },
        el("span", { class: "rotulo-lado" }, `Dupla ${lado}`),
        sel1, el("span", {}, "+"), sel2,
        el("button", { type: "button", id: `salvar-${c.chave}-${lado}`, class: "primario mini", onclick: salvar }, "Salvar"),
        info.manual && el("button", { type: "button", class: "mini", onclick: voltar }, "Voltar à automática"),
        el("button", { type: "button", class: "discreto mini", onclick: () => { fechar(); renderizar(); } }, "Cancelar"),
        Util.mensagemDeErro(idErro, erro));
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
          info.dupla ? duplaComFicha(info.dupla, `${c.chave}-${lado}`) : c.origem[lado - 1]),
        info.dupla && !info.manual && el("span", { class: "origem-dupla" }, c.origem[lado - 1]),
        info.manual && el("span", {
          class: "tag-manual",
          title: info.automatica ? `Automática seria: ${nomesDupla(info.automatica)}` : "Automática ainda indefinida",
        }, "alterada manualmente"),
        vencedora && el("span", { class: "tag-vence" }, Icones.svg("confirmar"), "vence"),
        botaoIcone({
          icone: "editar", rotulo: `Trocar a dupla ${lado} (${ROTULOS[c.chave]})`, id: `editar-${c.chave}-${lado}`, class: "discreto mini",
          onclick: () => { editandoDupla = { chave: c.chave, lado }; renderizar(); },
        }));
    }

    const idErroMM = (id) => `${id}-erro`;

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
        ...Util.atributosDeErro(idErroMM(id), errosCampo.get(id)),
        dataset: { chave: c.chave, indice: String(indice), campo },
        onchange: aoMudarPlacarMM,
        onkeydown: aoTeclarNoPlacarMM,
        onfocus: (ev) => ev.target.select(),
      });
    }

    // A linha do placar e, embaixo, o erro de cada um dos dois campos (se houver).
    function linhaPlacarMM(c, indice, etapa, partida) {
      const rotulo = NOMES_CAMPO[etapa];
      const ids = [1, 2].map((lado) => `mm-${c.chave}-${indice}-${etapa}${lado}`);
      return [
        el("div", { class: `linha-placar etapa-${etapa}` },
          el("span", { class: "rotulo-etapa" }, rotulo[0].toUpperCase() + rotulo.slice(1)),
          entradaMM(c, indice, `${etapa}1`, rotulo, partida),
          el("span", { class: "x" }, "×"),
          entradaMM(c, indice, `${etapa}2`, rotulo, partida)),
        ids.map((id) => Util.mensagemDeErro(idErroMM(id), errosCampo.get(id))),
      ];
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
          resultado = `Dupla ${a.vencedor} vence`
            + (a.decididoEm === "prorrogacao" ? " na prorrogação" : a.decididoEm === "penaltis" ? " nos pênaltis" : "");
        } else if (a.erro) resultado = a.erro;
        else if (a.precisa === "prorrogacao") resultado = "Empate: lance a prorrogação.";
        else if (a.precisa === "penaltis") resultado = "Empate na prorrogação: lance os pênaltis.";

        blocos.push(el("div", { class: "partida" },
          c.melhorDe > 1 && el("div", { class: "titulo-partida" }, `Jogo ${i + 1}`),
          linhaPlacarMM(c, i, "gols", partida),
          mostrarProrrogacao && linhaPlacarMM(c, i, "prorrogacao", partida),
          mostrarPenaltis && linhaPlacarMM(c, i, "penaltis", partida),
          resultado && el("div", { class: "resultado-partida" + (a.erro ? " erro" : a.vencedor ? "" : " pendente") },
            Icones.svg(a.vencedor ? "confirmar" : a.erro ? "alerta" : "info"), resultado)));
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
      // Vagas ímpares: o jogador que sobrou precisa de parceiro antes de jogar.
      const semParceiro = [c.dupla1, c.dupla2].find((d) => d && !Regras.duplaCompleta(d));

      return el("article", { class: `confronto${serie.vencedor ? " decidido" : ""}`, id: `mm-${c.chave}` },
        el("div", { class: "jogo-topo" },
          el("span", { class: "jogo-numero" }, ROTULOS[c.chave]),
          el("span", { class: "origem" }, c.melhorDe > 1 ? `Melhor de ${c.melhorDe}` : "Jogo único"),
          el("span", { class: "status" }, status)),
        linhaDupla(c, 1, tabela),
        linhaDupla(c, 2, tabela),
        erroDuplas && el("div", { class: "alerta" }, Icones.svg("alerta"), erroDuplas),
        semParceiro && el("div", { class: "alerta", id: `sem-parceiro-${c.chave}` }, Icones.svg("alerta"),
          `${app.nomePorId.get(semParceiro[0])} está sem dupla: escolha o parceiro em "Trocar a dupla" para liberar os placares.`),
        c.melhorDe > 1 && c.pronto && el("div", { class: "placar-serie" },
          `Série: ${serie.vitorias[0]} × ${serie.vitorias[1]}`,
          !serie.vencedor && el("span", { class: "legenda" }, ` (vence quem fizer ${serie.necessarias})`)),
        c.pronto
          ? partidasDoConfronto(c)
          : el("p", { class: "legenda" }, "Os placares abrem quando as duas duplas estiverem definidas."));
    }

    function podio(p, comTerceiro) {
      const degrau = (classe, icone, titulo, dupla) => el("div", { class: `degrau ${classe}${dupla ? "" : " vazio"}` },
        el("span", { class: "medalha", "aria-hidden": "true" }, Icones.svg(icone)),
        el("div", {},
          el("div", { class: "titulo-degrau" }, titulo),
          dupla
            ? dupla.map((id) => el("div", { class: "nome-podio" }, app.botaoJogador(id, `ver-podio-${classe}-${id}`)))
            : el("div", { class: "a-definir" }, "a definir")));
      return el("div", { class: "podio", id: "podio" },
        degrau("ouro", "trofeu", "Campeões", p.campeoes),
        degrau("prata", "medalha", "Vice", p.vice),
        comTerceiro && degrau("bronze", "medalha", "3º lugar", p.terceiro));
    }

    function renderizarMataMata(atual, tabela) {
      if (!atual.mataMata) {
        alvo.replaceChildren(painelGerar(atual, tabela));
        return;
      }
      const mm = Regras.resolverMataMata(atual.mataMata, tabela, atual.campeonato.config);
      alvo.replaceChildren(
        barraMataMata(mm),
        el("div", { class: "chave" },
          mm.rodadas.map((rodada, i) => el("div", { class: "coluna-chave", id: `rodada-${rodada.id}` },
            el("h3", {}, rodada.nome),
            i === 0 && mm.folgam.length > 0 && el("p", { class: "legenda folgas-rodada", id: "folgas-rodada" },
              `Folgam e entram na seguinte: ${mm.folgam.map((f) => f.origem).join(", ")}.`),
            rodada.confrontos.map((c) => cartaoConfronto(c, tabela)),
            rodada.id === "final" && mm.terceiro && [el("h3", {}, "Disputa de 3º lugar"), cartaoConfronto(mm.terceiro, tabela)])),
          el("div", { class: "coluna-chave" },
            el("h3", {}, "Pódio"),
            podio(mm.podio, Boolean(mm.terceiro)))));
    }

    function aoMudarPlacarMM(ev) {
      const campoEl = ev.target;
      const { chave, campo } = campoEl.dataset;
      const indice = Number(campoEl.dataset.indice);
      const g = lerGols(campoEl.value);
      if (g.invalido) {
        rascunhosMM.set(campoEl.id, campoEl.value);
        errosCampo.set(campoEl.id, `Placar inválido: use números de 0 a ${MAX_GOLS}.`);
        renderizar();
        return;
      }
      rascunhosMM.delete(campoEl.id);
      errosCampo.delete(campoEl.id);
      const valor = g.vazio ? null : g.valor;
      const jogo = Regras.melhorDeDoConfronto(estado.atual().mataMata, chave) > 1 ? ` jogo ${indice + 1}` : "";
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
      const anterior = buscar(raiz, focarAposId);
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
        errosCampo.clear();
        editandoDupla = null;
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, mataMata: { criar } };
})();
