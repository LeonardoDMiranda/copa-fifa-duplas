// Modo telão: tela cheia, fonte grande, alterna Classificação, Jogos e Mata-mata a cada 15 s.
// Só lê o estado; não altera nada. Pode rodar na mesma janela (sobre o app) ou numa
// janela separada (index.html#telao) arrastada para a TV.

(function () {
  "use strict";

  const INTERVALO_MS = 15000;
  const CONTROLES_VISIVEIS_MS = 3000;
  const { el, formatarSaldo, classeDoLado } = Util;
  const { VAGAS_FASE_FINAL } = Regras;
  const TITULOS = { classificacao: "Classificação", jogos: "Jogos da semana", "mata-mata": "Mata-mata" };
  const ROTULOS_MM = { semi1: "Semifinal 1", semi2: "Semifinal 2", terceiro: "3º lugar", final: "Final" };

  function criar(estado) {
    const nomePorId = new Map();
    const raiz = document.getElementById("telao");
    let ativo = false;
    let pausado = false;
    let telaAtual = "classificacao";
    let decorrido = 0;
    let ultimoTick = 0;
    let relogio = null;
    let timerControles = null;
    let estavaEmTelaCheia = false;

    const nomesDupla = (dupla) => dupla.map((id) => nomePorId.get(id)).join(" + ");

    // Só entram no rodízio as telas que têm o que mostrar: os jogos (depois do calendário
    // confirmado) e o mata-mata (depois de gerado).
    function telasDisponiveis() {
      const atual = estado.atual();
      const telas = ["classificacao"];
      if (atual.jogos.length) telas.push("jogos");
      if (atual.mataMata) telas.push("mata-mata");
      return telas;
    }

    // ---------- abrir / fechar / navegar ----------

    function abrir({ telaCheia = true } = {}) {
      ativo = true;
      pausado = false;
      telaAtual = "classificacao";
      decorrido = 0;
      ultimoTick = performance.now();
      raiz.hidden = false;
      document.body.classList.add("telao-ativo");
      clearInterval(relogio);
      relogio = setInterval(tick, 250);
      if (telaCheia) entrarTelaCheia();
      mostrarControles();
      renderizar();
    }

    function fechar() {
      if (!ativo) return;
      ativo = false;
      clearInterval(relogio);
      clearTimeout(timerControles);
      raiz.hidden = true;
      raiz.replaceChildren();
      document.body.classList.remove("telao-ativo");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (location.hash === "#telao") history.replaceState(null, "", location.pathname + location.search);
    }

    function entrarTelaCheia() {
      if (!raiz.requestFullscreen) return;
      // Sem permissão (ex.: sem clique do usuário), continua na janela normal.
      raiz.requestFullscreen().catch(() => {}).finally(renderizar);
    }

    function abrirNovaJanela() {
      const janela = window.open("index.html#telao", "copa-fifa-telao", "popup,width=1280,height=720");
      if (!janela) return;
      fechar();
    }

    function avancar(delta) {
      const lista = telasDisponiveis();
      const i = Math.max(lista.indexOf(telaAtual), 0);
      telaAtual = lista[(i + delta + lista.length) % lista.length];
      decorrido = 0;
      renderizar();
    }

    function alternarPausa() {
      pausado = !pausado;
      mostrarControles();
      renderizar();
    }

    function tick() {
      const agora = performance.now();
      if (!pausado) decorrido += agora - ultimoTick;
      ultimoTick = agora;
      if (decorrido >= INTERVALO_MS) {
        avancar(1);
        return;
      }
      const barra = document.getElementById("telao-barra");
      if (barra) barra.style.width = `${Math.min(100, (decorrido / INTERVALO_MS) * 100)}%`;
      const hora = document.getElementById("telao-hora");
      if (hora) hora.textContent = horaAtual();
    }

    function horaAtual() {
      return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }

    // Controles somem depois de 3 s sem mexer o mouse (continuam visíveis se pausado).
    function mostrarControles() {
      raiz.classList.add("controles-visiveis");
      clearTimeout(timerControles);
      timerControles = setTimeout(() => raiz.classList.remove("controles-visiveis"), CONTROLES_VISIVEIS_MS);
    }

    // ---------- telas ----------

    function telaClassificacao(tabela) {
      const tabelaDe = (linhas) => el("table", { class: "telao-tabela" },
        el("thead", {}, el("tr", {},
          el("th", { class: "pos" }, ""), el("th", { class: "var" }, ""), el("th", { class: "nome" }, "Jogador"),
          ["Pts", "V", "SG", "GP", "J"].map((t) => el("th", {}, t)))),
        el("tbody", {}, linhas.map((l) => {
          let classe = l.posicao <= VAGAS_FASE_FINAL ? "classificado" : "";
          if (l.posicao === VAGAS_FASE_FINAL) classe += " corte";
          let variacao = "";
          if (l.variacao > 0) variacao = `▲${l.variacao}`;
          if (l.variacao < 0) variacao = `▼${-l.variacao}`;
          return el("tr", { class: classe || null },
            el("td", { class: "pos" }, `${l.posicao}º`),
            el("td", { class: `var ${l.variacao > 0 ? "sobe" : "desce"}` }, variacao),
            el("td", { class: "nome" }, l.nome, l.empateTecnico ? el("span", { class: "empate" }, " ⚖️") : null),
            el("td", { class: "pts" }, String(l.pontos)),
            el("td", {}, String(l.v)),
            el("td", {}, formatarSaldo(l.sg)),
            el("td", {}, String(l.gp)),
            el("td", {}, String(l.jogos)));
        })));
      const meio = Math.ceil(tabela.length / 2);
      return el("div", { class: "telao-duas-colunas" }, tabelaDe(tabela.slice(0, meio)), tabelaDe(tabela.slice(meio)));
    }

    // `jogos` = só os jogos da semana em andamento; a grade se ajusta ao número deles.
    function telaJogos(jogos) {
      const proximo = jogos.find((j) => !j.resultado);
      return el("div", { class: "telao-jogos", style: `--n: ${Math.max(jogos.length, 1)}` }, jogos.map((jogo, i) => {
        const r = jogo.resultado;
        // Classes com prefixo telao- para não herdar os estilos dos cartões do app (.dupla, .placar).
        let placar;
        if (!r) placar = el("div", { class: "telao-placar pendente" }, "×");
        else if (r.tipo === "anulado") placar = el("div", { class: "telao-placar" }, "–", el("small", {}, "ANULADO"));
        else if (r.tipo === "wo") {
          placar = el("div", { class: "telao-placar" },
            `${r.vencedor === 1 ? 3 : 0} × ${r.vencedor === 2 ? 3 : 0}`, el("small", {}, "W.O."));
        } else placar = el("div", { class: "telao-placar" }, `${r.gols1} × ${r.gols2}`);
        const ehProximo = jogo === proximo;
        return el("div", { class: `telao-jogo${r ? " lancado" : ""}${ehProximo ? " proximo" : ""}` },
          el("div", { class: "rotulo" }, `Jogo ${i + 1}`, ehProximo && el("span", { class: "tag-proximo" }, "PRÓXIMO")),
          el("div", { class: `telao-dupla d1${classeDoLado(r, 1)}` }, nomesDupla(jogo.dupla1)),
          placar,
          el("div", { class: `telao-dupla d2${classeDoLado(r, 2)}` }, nomesDupla(jogo.dupla2)));
      }));
    }

    function confronto(c) {
      const vencedor = c.serie.vencedor;
      return el("div", { class: `telao-confronto${vencedor ? " decidido" : ""}` },
        el("div", { class: "rotulo" }, ROTULOS_MM[c.chave], c.melhorDe > 1 ? ` · melhor de ${c.melhorDe}` : ""),
        [1, 2].map((lado) => {
          const dupla = c[`dupla${lado}`];
          let classe = "linha";
          if (vencedor === lado) classe += " vencedora";
          else if (vencedor) classe += " perdedora";
          return el("div", { class: classe },
            el("span", { class: dupla ? "nomes" : "nomes a-definir" },
              dupla ? nomesDupla(dupla) : (Exportar.ORIGEM[c.chave] || ["A definir", "A definir"])[lado - 1],
              dupla && c[`lado${lado}`].manual ? el("sup", {}, "*") : null),
            el("span", { class: "valor" }, String(Exportar.valorDoLado(c, lado))));
        }),
        el("div", { class: "detalhe" }, Exportar.detalheDoConfronto(c)));
    }

    function podio(p) {
      const degrau = (classe, medalha, titulo, dupla) => el("div", { class: `telao-degrau ${classe}${dupla ? "" : " vazio"}` },
        el("span", { class: "medalha" }, medalha),
        el("div", {},
          el("div", { class: "titulo" }, titulo),
          el("div", { class: "nomes" }, dupla ? dupla.map((id) => nomePorId.get(id)).join(" e ") : "a definir")));
      return el("div", { class: "telao-podio" },
        degrau("ouro", "🥇", "Campeões", p.campeoes),
        degrau("prata", "🥈", "Vice", p.vice),
        degrau("bronze", "🥉", "3º lugar", p.terceiro));
    }

    function telaMataMata(mm) {
      return el("div", { class: "telao-chave" },
        el("div", { class: "coluna" }, el("h2", {}, "Semifinais"), confronto(mm.semi1), confronto(mm.semi2)),
        el("div", { class: "coluna" }, el("h2", {}, "Final"), confronto(mm.final), el("h2", {}, "Disputa de 3º lugar"), confronto(mm.terceiro)),
        el("div", { class: "coluna" }, el("h2", {}, "Pódio"), podio(mm.podio)));
    }

    // ---------- render ----------

    function renderizar() {
      if (!ativo) return;
      const atual = estado.atual();
      const lista = telasDisponiveis();
      if (!lista.includes(telaAtual)) telaAtual = "classificacao";
      const config = atual.campeonato.config;
      const base = Regras.baseDosJogadores(atual.campeonato.jogadores);
      nomePorId.clear();
      for (const l of base) nomePorId.set(l.id, l.nome);
      const tabela = Regras.classificacaoPorSemana(base, atual.jogos, atual.desempatesManuais, config);
      const lancados = atual.jogos.filter((j) => j.resultado).length;

      let conteudo, complemento = "", titulo = TITULOS[telaAtual];
      if (telaAtual === "classificacao") {
        conteudo = telaClassificacao(tabela);
        if (atual.jogos.length) complemento = lancados === atual.jogos.length ? "final" : `${lancados}/${atual.jogos.length} jogos lançados`;
      } else if (telaAtual === "jogos") {
        const semana = Regras.semanaAtual(atual.jogos, config);
        const daSemana = atual.jogos.filter((j) => Regras.semanaDoJogo(j) === semana);
        conteudo = telaJogos(daSemana);
        titulo = `${TITULOS.jogos} ${semana}`;
        complemento = `${daSemana.filter((j) => j.resultado).length}/${daSemana.length} lançados`;
      } else {
        conteudo = telaMataMata(Regras.resolverMataMata(atual.mataMata, tabela, config));
      }

      raiz.classList.toggle("pausado", pausado);
      raiz.replaceChildren(
        el("header", { class: "telao-topo" },
          el("span", { class: "marca" }, atual.campeonato.nome),
          el("span", { class: "titulo", id: "telao-titulo" }, titulo,
            complemento && el("small", {}, ` · ${complemento}`)),
          pausado && el("span", { class: "tag-pausado" }, "⏸ PAUSADO"),
          el("span", { class: "hora", id: "telao-hora" }, horaAtual())),
        el("main", { class: `telao-conteudo tela-${telaAtual}` }, conteudo),
        el("footer", { class: "telao-rodape" },
          el("div", { class: "telao-progresso" }, el("div", { id: "telao-barra" })),
          el("div", { class: "telao-controles" },
            el("button", { type: "button", id: "telao-anterior", title: "Tela anterior (←)", onclick: () => avancar(-1) }, "◀"),
            el("button", { type: "button", id: "telao-pausa", title: "Pausar/continuar (espaço)", onclick: alternarPausa },
              pausado ? "▶ Continuar" : "⏸ Pausar"),
            el("button", { type: "button", id: "telao-proxima", title: "Próxima tela (→)", onclick: () => avancar(1) }, "▶"),
            el("span", { class: "telao-telas" }, lista.map((t) => el("span", { class: t === telaAtual ? "ativa" : null }, TITULOS[t]))),
            !document.fullscreenElement && el("button", { type: "button", id: "telao-tela-cheia", onclick: entrarTelaCheia }, "⛶ Tela cheia"),
            el("button", {
              type: "button", id: "telao-nova-janela", onclick: abrirNovaJanela,
              title: "Abre o telão numa janela separada: arraste para a TV e continue lançando os placares nesta",
            }, "↗ Nova janela"),
            el("button", { type: "button", id: "telao-sair", onclick: fechar }, "✕ Sair (Esc)"))));
      const barra = document.getElementById("telao-barra");
      if (barra) barra.style.width = `${Math.min(100, (decorrido / INTERVALO_MS) * 100)}%`;
    }

    // ---------- eventos ----------

    document.addEventListener("keydown", (ev) => {
      if (!ativo) return;
      if (ev.key === "Escape") fechar();
      else if (ev.key === " ") alternarPausa();
      else if (ev.key === "ArrowRight") avancar(1);
      else if (ev.key === "ArrowLeft") avancar(-1);
      else return;
      ev.preventDefault();
    });

    // Em tela cheia o navegador consome o Esc: sair da tela cheia fecha o telão.
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        estavaEmTelaCheia = true;
      } else if (estavaEmTelaCheia) {
        estavaEmTelaCheia = false;
        fechar();
      }
    });

    raiz.addEventListener("mousemove", mostrarControles);
    estado.aoMudar(renderizar);

    return { abrir, fechar, ativo: () => ativo };
  }

  globalThis.Telao = { criar, INTERVALO_MS };
})();
