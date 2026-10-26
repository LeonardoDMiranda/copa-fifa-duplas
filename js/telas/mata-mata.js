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
    let trocando = null; // { chave, lado } da dupla escolhida para trocar de lugar (falta escolher com quem)
    let avisoTroca = ""; // por que uma troca de lugar não pôde ser feita
    let mataMataAtual = null; // mata-mata resolvido do último desenho (a estrutura diz quais confrontos são da mesma rodada)
    let focarAposId = null; // após Enter num placar do mata-mata, foca o campo seguinte a este
    let ausentesPrevia = []; // ids marcados como ausentes na prévia; só viram parte do estado quando o chaveamento é gerado
    let ausenciaAberta = null; // { chave, jogador } do painel "Ausência" aberto num confronto

    // Depois de cada alteração, guarda as duplas que jogaram o 3º lugar e a final (ver
    // Regras.fixarDuplasJogadas): corrigir uma semi não passa esses placares para outra dupla.
    function modificarMataMata(descricao, alterar) {
      const mudou = estado.modificar(descricao, (s) => {
        s.mataMata = Regras.fixarDuplasJogadas(alterar(s.mataMata), tabelaAtual(), app.config());
      });
      if (!mudou) renderizar();
    }

    // Nome com a posição: na liga única, a da classificação ("3º Fulano"); com grupos, a do grupo.
    const rotuloNaTabela = (l) => (l.grupo ? `${l.nome} (${l.posicaoNoGrupo}º do Grupo ${l.grupo})` : `${l.posicao}º ${l.nome}`);

    // A lista que o chaveamento usa com esses ausentes: na liga única, a classificação (os ausentes saem na hora
    // de gerar); com grupos, a semeadura refeita sem eles (o próximo do mesmo grupo entra).
    function listaComAusentes(atual, tabela, ausentes) {
      const cfg = atual.campeonato.config;
      return Regras.usaGrupos(cfg) ? Regras.classificacaoDaFaseFinal(app.base(), atual.jogos, atual.desempatesManuais, cfg, ausentes) : tabela;
    }

    function painelGerar(atual, tabelaAoVivo) {
      const cfg = atual.campeonato.config;
      const vagas = cfg.vagasFaseFinal;
      const comGrupos = Regras.usaGrupos(cfg);
      if (tabelaAoVivo.length < vagas) {
        return app.proximoPasso(`O chaveamento precisa de pelo menos ${vagas} jogadores cadastrados.`, "jogadores", "Ir para Jogadores");
      }
      ausentesPrevia = ausentesPrevia.filter((id) => tabelaAoVivo.some((l) => l.id === id));
      const tabela = listaComAusentes(atual, tabelaAoVivo, ausentesPrevia);
      // Com grupos, cada grupo precisa ter os seus classificados sem os ausentes.
      const faltamJogadores = comGrupos
        ? tabela.filter((l) => l.classificado).length < vagas
        : Regras.semAusentes(tabela, ausentesPrevia).length < vagas;
      const painel = painelAusentesPrevia(tabelaAoVivo, tabela, vagas);
      if (faltamJogadores) {
        return el("div", { class: "gerar-chave" }, painel,
          el("div", { class: "alerta", id: "aviso-ausentes-demais" }, Icones.svg("alerta"), comGrupos
            ? `Sem os ausentes, algum grupo fica com menos de ${cfg.grupos.classificados} jogadores para classificar. Remova algum ausente.`
            : `Sem os ausentes, restam menos de ${vagas} jogadores para o chaveamento. Remova algum ausente.`));
      }
      const avisos = Regras.avisosParaGerarChaveamento(atual.jogos, tabela, cfg, ausentesPrevia);
      // A prévia é o próprio chaveamento que seria gerado agora: só a 1ª rodada e quem folga.
      const previa = Regras.resolverMataMata(Regras.gerarMataMata(tabela, cfg, ausentesPrevia), tabela, cfg);
      const primeira = previa.rodadas[0];
      const linhaPrevia = (c) => el("li", {},
        el("strong", {}, `${ROTULOS[c.chave]}: `),
        duplaComFicha(c.dupla1, `previa-${c.chave}-1`), ` (${c.origem[0]}) × `,
        duplaComFicha(c.dupla2, `previa-${c.chave}-2`), ` (${c.origem[1]})`);
      const linhaFolga = (f, i) => el("li", {}, duplaComFicha(f.dupla, `previa-folga-${i}`), ` (${f.origem})`);
      return el("div", { class: "gerar-chave" },
        painel,
        el("p", {}, `Prévia pela ${comGrupos ? "semeadura" : "classificação"} atual (${vagas} classificados, ${primeira.nome.toLowerCase()}):`),
        el("ul", { class: "previa" }, primeira.confrontos.map(linhaPrevia)),
        previa.folgam.length > 0 && el("div", {},
          el("p", { class: "legenda" }, `Folgam nesta rodada e entram na seguinte (${previa.folgam.length}):`),
          el("ul", { class: "previa", id: "previa-folgas" }, previa.folgam.map(linhaFolga))),
        vagas % 2 === 1 && el("p", { class: "legenda", id: "aviso-vagas-impares" }, Icones.svg("alerta"),
          `Com ${vagas} classificados, o ${(vagas + 1) / 2}º colocado fica sem dupla. Depois de gerar, escolha o parceiro dele em "Trocar a dupla"; `
          + "o confronto dele só abre quando a dupla estiver completa."),
        avisos.length
          ? el("ul", { class: "avisos-chave" }, avisos.map(itemAlerta))
          : el("p", { class: "tudo-certo" }, Icones.svg("ok"), comGrupos
            ? "Todos os jogos lançados e nenhum empate técnico pendente entre os classificados dos grupos nem na semeadura."
            : `Todos os jogos lançados e nenhum empate técnico pendente no top ${vagas}.`),
        el("button", { type: "button", id: "btn-gerar-chave", class: "primario", onclick: gerarChaveamento }, "Gerar chaveamento"));
    }

    // Jogadores que não vão jogar a fase final, marcados antes de gerar o chaveamento: quem vem depois
    // na classificação sobe e entra na mesma posição (Regras.semAusentes). Com grupos, entra o próximo do
    // mesmo grupo e a semeadura é refeita (`comAusentes` já é a lista refeita).
    function painelAusentesPrevia(tabela, comAusentes, vagas) {
      const nome = (id) => app.nomePorId.get(id);
      const comGrupos = Regras.usaGrupos(app.config());
      const entram = comGrupos
        ? comAusentes.filter((l) => l.classificado && !tabela.some((x) => x.id === l.id && x.classificado))
        : Regras.semAusentes(tabela, ausentesPrevia).slice(0, vagas).filter((l) => tabela.indexOf(l) >= vagas);
      const candidatos = tabela.filter((l) => !ausentesPrevia.includes(l.id));
      const seletor = el("select", { id: "sel-ausente-previa", "aria-label": "Jogador ausente na fase final" },
        el("option", { value: "" }, "Jogador"),
        candidatos.map((l) => el("option", { value: l.id }, rotuloNaTabela(l))));
      const marcar = () => {
        if (!seletor.value) return;
        ausentesPrevia = [...ausentesPrevia, seletor.value];
        app.focarDepois("sel-ausente-previa");
        renderizar();
      };
      return el("div", { class: "ausentes-previa", id: "ausentes-previa" },
        el("p", { class: "legenda" }, comGrupos
          ? "Algum classificado não vai jogar a fase final? Marque o ausente: o próximo do mesmo grupo se classifica e a semeadura é refeita."
          : "Algum classificado não vai jogar a fase final? Marque o ausente: o próximo da classificação entra na mesma posição."),
        el("div", { class: "editor-dupla" }, seletor,
          el("button", { type: "button", id: "btn-marcar-ausente", class: "mini", onclick: marcar }, "Marcar ausente")),
        ausentesPrevia.length > 0 && el("ul", { class: "previa", id: "lista-ausentes" },
          ausentesPrevia.map((id) => el("li", {}, `${nome(id)} (ausente) `,
            el("button", {
              type: "button", id: `remover-ausente-${id}`, class: "discreto mini",
              "aria-label": `Remover ${nome(id)} dos ausentes`,
              onclick: () => { ausentesPrevia = ausentesPrevia.filter((x) => x !== id); renderizar(); },
            }, "Remover")))),
        ausentesPrevia.length > 0 && entram.length > 0 && el("p", { class: "legenda", id: "entram-no-lugar" },
          `Entram no lugar: ${entram.map(rotuloNaTabela).join(", ")}.`));
    }

    // Recalcula na hora do clique: um placar digitado logo antes pode ter mudado a classificação.
    async function gerarChaveamento() {
      const ausentes = ausentesPrevia.slice();
      const lista = () => listaComAusentes(estado.atual(), tabelaAtual(), ausentes);
      const avisos = Regras.avisosParaGerarChaveamento(estado.atual().jogos, lista(), app.config(), ausentes);
      if (avisos.length && !(await confirmar(`- ${avisos.join("\n- ")}`,
        { titulo: "Gerar o chaveamento mesmo assim?", acao: "Gerar mesmo assim", perigo: true }))) return;
      if (estado.atual().mataMata) return; // outra janela já gerou
      const tabela = lista();
      ausentesPrevia = [];
      estado.modificar("gerar chaveamento", (s) => { s.mataMata = Regras.gerarMataMata(tabela, app.config(), ausentes); });
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

    // ---------- trocar duplas de lugar ----------
    // Escolhe uma dupla e depois, na mesma rodada, aquela com quem ela troca de lugar.

    const mesmoLugar = (a, b) => Boolean(a && b) && a.chave === b.chave && a.lado === b.lado;

    function iniciarTroca(lugar) {
      const erro = Regras.erroDeTrocaDeLugar(estado.atual().mataMata, tabelaAtual(), lugar, null, app.config());
      avisoTroca = erro || "";
      trocando = erro ? null : lugar;
      if (trocando) app.focarDepois("trocar-cancelar");
      renderizar();
    }

    function cancelarTroca() {
      const origem = trocando;
      trocando = null;
      avisoTroca = "";
      if (origem) app.focarDepois(`trocar-${origem.chave}-${origem.lado}`);
      renderizar();
    }

    function trocarCom(destino) {
      const origem = trocando;
      trocando = null;
      avisoTroca = "";
      app.focarDepois(`trocar-${origem.chave}-${origem.lado}`);
      modificarMataMata(
        `${ROTULOS[origem.chave]}, dupla ${origem.lado} troca de lugar com ${ROTULOS[destino.chave]}, dupla ${destino.lado}`,
        (m) => Regras.trocarDeLugar(m, tabelaAtual(), origem, destino, app.config()));
    }

    // O que aparece ao lado de uma dupla: "trocar de lugar" (sem escolha em andamento), "cancelar" (na dupla
    // escolhida) ou "trocar com esta" (nas outras da mesma rodada, se a troca vale).
    function controleDeTroca(c, lado, tabela) {
      const lugar = { chave: c.chave, lado };
      if (!c[`dupla${lado}`]) return null;
      if (!trocando) {
        return botaoIcone({
          icone: "trocar", rotulo: `Trocar de lugar a dupla ${lado} (${ROTULOS[c.chave]})`, id: `trocar-${c.chave}-${lado}`,
          class: "discreto mini", onclick: () => iniciarTroca(lugar),
        });
      }
      if (mesmoLugar(trocando, lugar)) {
        return el("button", { type: "button", id: "trocar-cancelar", class: "mini", "aria-pressed": "true", onclick: cancelarTroca }, "Cancelar troca");
      }
      const rodada = mataMataAtual.estrutura.rodadaDe;
      if (rodada[c.chave] === undefined || rodada[c.chave] !== rodada[trocando.chave] || c.chave === trocando.chave) return null;
      const erro = Regras.erroDeTrocaDeLugar(estado.atual().mataMata, tabela, trocando, lugar, app.config());
      if (erro) return el("span", { class: "legenda troca-indisponivel", id: `troca-indisponivel-${c.chave}-${lado}` }, "não pode trocar");
      return el("button", {
        type: "button", id: `trocar-com-${c.chave}-${lado}`, class: "primario mini",
        "aria-label": `Trocar de lugar com a dupla ${lado} (${ROTULOS[c.chave]})`, onclick: () => trocarCom(lugar),
      }, "Trocar com esta");
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
        tabela.filter((l) => !l.ausente).map((l) => el("option", { value: l.id, selected: l.id === atual[n - 1] }, rotuloNaTabela(l))));
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
      if (editandoDupla && editandoDupla.chave === c.chave && editandoDupla.lado === lado && !c.wo) {
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
        c.wo === lado && el("span", { class: "tag-wo", title: "Esta dupla não compareceu" }, "W.O."),
        vencedora && el("span", { class: "tag-vence" }, Icones.svg("confirmar"), c.wo ? "avança" : "vence"),
        // Com W.O. a dupla não muda nem troca de lugar até o W.O. ser desfeito.
        !c.wo && botaoIcone({
          icone: "editar", rotulo: `Trocar a dupla ${lado} (${ROTULOS[c.chave]})`, id: `editar-${c.chave}-${lado}`, class: "discreto mini",
          onclick: () => { editandoDupla = { chave: c.chave, lado }; renderizar(); },
        }),
        !c.wo && controleDeTroca(c, lado, tabela));
    }

    // ---------- ausência de um jogador (Fase 26) ----------
    // Duas saídas, escolhidas pelo organizador: substituir o ausente pelo próximo da classificação (a dupla
    // segue) ou dar W.O. à dupla dele (a adversária avança sem placar). Regras em Regras.substituirJogador / marcarWO.

    async function substituirAusente(c, lado, jogador, entra) {
      const nome = (id) => app.nomePorId.get(id);
      const ok = await confirmar(`${nome(jogador)} sai e ${nome(entra)} entra na dupla ${lado} de ${ROTULOS[c.chave]}. A dupla segue no mata-mata.`,
        { titulo: "Substituir o jogador ausente?", acao: "Substituir" });
      if (!ok) return;
      ausenciaAberta = null;
      modificarMataMata(`${ROTULOS[c.chave]}: ${nome(jogador)} substituído por ${nome(entra)}`,
        (m) => Regras.substituirJogador(m, tabelaAtual(), c.chave, lado, jogador, app.config()));
    }

    async function darWO(c, lado) {
      const ok = await confirmar(`A dupla ${lado} (${nomesDupla(c[`dupla${lado}`])}) não comparece e a dupla ${3 - lado} avança sem placar. `
        + "Dá para voltar com \"Desfazer W.O.\".", { titulo: "Dar W.O. a esta dupla?", acao: "Dar W.O.", perigo: true });
      if (!ok) return;
      ausenciaAberta = null;
      modificarMataMata(`${ROTULOS[c.chave]}: W.O. da dupla ${lado}`, (m) => Regras.marcarWO(m, tabelaAtual(), c.chave, lado, app.config()));
    }

    function desfazerWO(c) {
      modificarMataMata(`${ROTULOS[c.chave]}: desfazer W.O.`, (m) => Regras.desfazerWO(m, c.chave));
    }

    function painelAusencia(c, tabela) {
      const mm = estado.atual().mataMata, cfg = app.config();
      const nome = (id) => app.nomePorId.get(id);
      const jogadores = [...(c.dupla1 || []), ...(c.dupla2 || [])].filter(Boolean);
      const escolhido = jogadores.includes(ausenciaAberta.jogador) ? ausenciaAberta.jogador : jogadores[0];
      const lado = (c.dupla1 || []).includes(escolhido) ? 1 : 2;
      // Com grupos, o substituto é o próximo do grupo do ausente (ver Regras.proximoSubstituto).
      const entra = Regras.proximoSubstituto(mm, tabela, cfg, escolhido);
      const erroSubstituir = Regras.erroDeSubstituicao(mm, tabela, c.chave, lado, escolhido, cfg);
      const erroWO = Regras.erroDeWO(mm, tabela, c.chave, lado, cfg);
      const seletor = el("select", {
        id: `ausente-${c.chave}`, "aria-label": `Jogador ausente (${ROTULOS[c.chave]})`,
        onchange: (ev) => { ausenciaAberta = { chave: c.chave, jogador: ev.target.value }; renderizar(); },
      }, jogadores.map((id) => el("option", { value: id, selected: id === escolhido }, nome(id))));
      const fechar = () => { ausenciaAberta = null; app.focarDepois(`ausencia-${c.chave}`); renderizar(); };
      return el("div", { class: "painel-ausencia", id: `painel-ausencia-${c.chave}` },
        el("div", { class: "editor-dupla" }, el("span", { class: "rotulo-lado" }, "Ausente"), seletor),
        el("div", { class: "acoes-ausencia" },
          el("button", {
            type: "button", id: `substituir-${c.chave}`, class: "primario mini", disabled: Boolean(erroSubstituir),
            onclick: () => substituirAusente(c, lado, escolhido, entra),
          }, entra ? `Substituir por ${nome(entra)}` : "Substituir"),
          el("button", {
            type: "button", id: `wo-${c.chave}`, class: "perigo mini", disabled: Boolean(erroWO), onclick: () => darWO(c, lado),
          }, `W.O. da dupla ${lado}`),
          el("button", { type: "button", id: `ausencia-cancelar-${c.chave}`, class: "discreto mini", onclick: fechar }, "Cancelar")),
        erroSubstituir && el("p", { class: "legenda", id: `erro-substituir-${c.chave}` }, `Substituir: ${erroSubstituir}`),
        erroWO && el("p", { class: "legenda", id: `erro-wo-${c.chave}` }, `W.O.: ${erroWO}`));
    }

    function controleDeAusencia(c, tabela) {
      if (c.wo) {
        return el("div", { class: "acoes-ausencia" },
          el("button", { type: "button", id: `desfazer-wo-${c.chave}`, class: "mini", onclick: () => desfazerWO(c) }, "Desfazer W.O."));
      }
      if (c.serie.vencedor || (!c.dupla1 && !c.dupla2)) return null;
      if (ausenciaAberta && ausenciaAberta.chave === c.chave) return painelAusencia(c, tabela);
      return el("div", { class: "acoes-ausencia" },
        el("button", {
          type: "button", id: `ausencia-${c.chave}`, class: "discreto mini",
          onclick: () => { ausenciaAberta = { chave: c.chave, jogador: null }; app.focarDepois(`ausente-${c.chave}`); renderizar(); },
        }, "Ausência"));
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
      else if (c.wo) status = "Decidido por W.O.";
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
        controleDeAusencia(c, tabela),
        erroDuplas && el("div", { class: "alerta" }, Icones.svg("alerta"), erroDuplas),
        semParceiro && el("div", { class: "alerta", id: `sem-parceiro-${c.chave}` }, Icones.svg("alerta"),
          `${app.nomePorId.get(semParceiro[0])} está sem dupla: escolha o parceiro em "Trocar a dupla" para liberar os placares.`),
        c.melhorDe > 1 && c.pronto && !c.wo && el("div", { class: "placar-serie" },
          `Série: ${serie.vitorias[0]} × ${serie.vitorias[1]}`,
          !serie.vencedor && el("span", { class: "legenda" }, ` (vence quem fizer ${serie.necessarias})`)),
        c.wo
          ? el("div", { class: "resultado-partida", id: `resultado-wo-${c.chave}` }, Icones.svg("confirmar"),
            `W.O. da dupla ${c.wo}: a dupla ${3 - c.wo} avança sem placar.`)
          : c.pronto
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
      mataMataAtual = mm;
      if (trocando && !mm.estrutura.fontes[trocando.chave]) trocando = null; // o chaveamento mudou (ex.: apagado em outra janela)
      // replaceChildren não descarta os false/null (como el() faz): filtra antes.
      alvo.replaceChildren(...[
        barraMataMata(mm),
        Boolean(avisoTroca) && el("div", { class: "alerta", id: "aviso-troca", role: "alert" }, Icones.svg("alerta"), avisoTroca,
          el("button", { type: "button", id: "aviso-troca-fechar", class: "mini", onclick: () => { avisoTroca = ""; renderizar(); } }, "Entendi")),
        trocando && el("div", { class: "alerta info", id: "banner-troca" }, Icones.svg("trocar"),
          `Trocar de lugar a dupla ${trocando.lado} de ${ROTULOS[trocando.chave]} (${nomesDupla(mm[trocando.chave][`dupla${trocando.lado}`] || [])}): `
          + "escolha, na mesma rodada, a dupla com quem ela troca."),
        el("div", { class: "chave" },
          mm.rodadas.map((rodada, i) => el("div", { class: "coluna-chave", id: `rodada-${rodada.id}` },
            el("h3", {}, rodada.nome),
            i === 0 && mm.folgam.length > 0 && el("p", { class: "legenda folgas-rodada", id: "folgas-rodada" },
              `Folgam e entram na seguinte: ${mm.folgam.map((f) => f.origem).join(", ")}.`),
            rodada.confrontos.map((c) => cartaoConfronto(c, tabela)),
            rodada.id === "final" && mm.terceiro && [el("h3", {}, "Disputa de 3º lugar"), cartaoConfronto(mm.terceiro, tabela)])),
          el("div", { class: "coluna-chave" },
            el("h3", {}, "Pódio"),
            podio(mm.podio, Boolean(mm.terceiro)))),
      ].filter(Boolean));
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
        trocando = null;
        avisoTroca = "";
        ausentesPrevia = [];
        ausenciaAberta = null;
      },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, mataMata: { criar } };
})();
