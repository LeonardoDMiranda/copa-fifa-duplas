// Modo telão: tela cheia, fonte grande, alterna as telas escolhidas (Classificação, Jogos e
// Mata-mata) a cada 10, 15 ou 30 s. Só lê o estado; não altera nada. Pode rodar na mesma janela
// (sobre o app) ou numa janela separada (index.html#telao) arrastada para a TV. A escolha de telas
// e o tempo ficam guardados por aparelho (CHAVE_PREFERENCIA), fora do campeonato e do backup.

(function () {
  "use strict";

  const INTERVALO_MS = 15000;
  const INTERVALOS_MS = [10000, 15000, 30000];
  const CONTROLES_VISIVEIS_MS = 3000;
  const CHAVE_PREFERENCIA = "copa-fifa-duplas-telao"; // sem o prefixo das edições (ver ui.js, evento storage)
  const { el, formatarSaldo, classeDoLado } = Util;
  const TELAS = ["classificacao", "jogos", "mata-mata"];
  const TITULOS = { classificacao: "Classificação", jogos: "Jogos da semana", "mata-mata": "Mata-mata" };
  const MOTIVOS = { jogos: "depois de confirmar o calendário", "mata-mata": "depois de gerar o chaveamento" };

  // Preferência guardada: { telas: [ids], intervaloMs } ou null (nunca escolheu, ou valor inválido).
  function lerPreferencia(armazenamento) {
    try {
      const obj = JSON.parse(armazenamento.getItem(CHAVE_PREFERENCIA));
      if (!obj || !Array.isArray(obj.telas) || !INTERVALOS_MS.includes(obj.intervaloMs)) return null;
      const telas = TELAS.filter((t) => obj.telas.includes(t));
      return telas.length ? { telas, intervaloMs: obj.intervaloMs } : null;
    } catch (_) {
      return null;
    }
  }

  function gravarPreferencia(armazenamento, { telas, intervaloMs }) {
    try {
      armazenamento.setItem(CHAVE_PREFERENCIA, JSON.stringify({ telas, intervaloMs }));
    } catch (_) {
      // sem armazenamento: vale só para esta abertura
    }
  }

  // Janela de escolha das telas. `disponibilidade` = [{ id, titulo, disponivel, motivo }] (a do
  // telão). Devolve { acao: "tela-cheia" | "janela", telas, intervaloMs } ou null se cancelou.
  // Sem preferência, começa com tudo o que existe marcado (o comportamento de antes).
  async function escolherTelas(disponibilidade, preferencia = null) {
    const existentes = disponibilidade.filter((t) => t.disponivel).map((t) => t.id);
    let marcadas = preferencia ? preferencia.telas.filter((t) => existentes.includes(t)) : existentes;
    if (!marcadas.length) marcadas = ["classificacao"];
    const caixas = disponibilidade.map((t) => el("input", {
      type: "checkbox", id: `telao-tela-${t.id}`, value: t.id, checked: t.disponivel && marcadas.includes(t.id), disabled: !t.disponivel,
    }));
    const intervalo = el("select", { id: "telao-intervalo" },
      INTERVALOS_MS.map((ms) => el("option", { value: String(ms), selected: ms === (preferencia ? preferencia.intervaloMs : INTERVALO_MS) }, `${ms / 1000} s`)));
    const aviso = el("p", { class: "erro-campo", id: "telao-escolha-aviso", role: "status", hidden: true }, "Marque ao menos uma tela.");
    const corpo = el("div", { class: "dialogo-corpo" },
      el("fieldset", {},
        el("legend", {}, "Telas"),
        disponibilidade.map((t, i) => el("label", { class: "telao-opcao" }, caixas[i], el("span", {}, t.titulo),
          !t.disponivel && el("small", {}, ` · ${t.motivo}`)))),
      el("label", { class: "telao-opcao-intervalo" }, el("span", {}, "Tempo em cada tela "), intervalo),
      aviso);
    const marcadasAgora = () => disponibilidade.filter((t, i) => caixas[i].checked).map((t) => t.id);
    const atualizar = () => {
      const vazio = marcadasAgora().length === 0;
      aviso.hidden = !vazio;
      for (const id of ["telao-escolha-abrir", "telao-escolha-janela"]) document.getElementById(id).disabled = vazio;
    };
    corpo.addEventListener("change", atualizar);
    const promessa = Util.escolher("Escolha as telas que aparecem na TV e quanto tempo cada uma fica.", {
      titulo: "Modo telão",
      opcoes: [
        { valor: "janela", id: "telao-escolha-janela", rotulo: "Abrir em nova janela" },
        { valor: "tela-cheia", id: "telao-escolha-abrir", rotulo: "Abrir telão", classe: "primario" },
      ],
      foco: "tela-cheia",
      corpo,
    });
    atualizar();
    const acao = await promessa;
    if (!acao) return null;
    return { acao, telas: marcadasAgora(), intervaloMs: Number(intervalo.value) };
  }

  function criar(estado) {
    const nomePorId = new Map();
    const raiz = document.getElementById("telao");
    let ativo = false;
    let pausado = false;
    let telaAtual = "classificacao";
    let selecao = null; // ids das telas escolhidas; null = todas as que existem
    let intervaloMs = INTERVALO_MS;
    let decorrido = 0;
    let ultimoTick = 0;
    let relogio = null;
    let timerControles = null;
    let estavaEmTelaCheia = false;

    const nomesDupla = (dupla) => dupla.map((id) => (id ? nomePorId.get(id) : "sem dupla")).join(" + ");

    // Só entram no rodízio as telas que têm o que mostrar: os jogos (depois do calendário
    // confirmado) e o mata-mata (depois de gerado).
    function telasExistentes() {
      const atual = estado.atual();
      const telas = ["classificacao"];
      if (atual.jogos.length) telas.push("jogos");
      if (atual.mataMata) telas.push("mata-mata");
      return telas;
    }

    // As que existem e foram escolhidas. Se nenhuma escolhida existe mais (ex.: o mata-mata foi
    // apagado), cai na Classificação, que sempre existe.
    function telasDisponiveis() {
      const existentes = telasExistentes();
      const lista = selecao ? existentes.filter((t) => selecao.includes(t)) : existentes;
      return lista.length ? lista : ["classificacao"];
    }

    // Para a janela de escolha: todas as telas, com o motivo de não estarem disponíveis ainda.
    function disponibilidade() {
      const existentes = telasExistentes();
      return TELAS.map((id) => ({ id, titulo: TITULOS[id], disponivel: existentes.includes(id), motivo: MOTIVOS[id] || "" }));
    }

    // ---------- abrir / fechar / navegar ----------

    // telas = ids a alternar (padrão: todas as que existem); intervalo = tempo em cada tela.
    function abrir({ telaCheia = true, telas = null, intervalo = INTERVALO_MS } = {}) {
      ativo = true;
      pausado = false;
      selecao = Array.isArray(telas) ? telas : null;
      intervaloMs = INTERVALOS_MS.includes(intervalo) ? intervalo : INTERVALO_MS;
      telaAtual = telasDisponiveis()[0];
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

    // Outra janela mudou a escolha de telas ou o tempo enquanto este telão está aberto.
    function definirSelecao({ telas = null, intervalo = INTERVALO_MS } = {}) {
      selecao = Array.isArray(telas) ? telas : null;
      intervaloMs = INTERVALOS_MS.includes(intervalo) ? intervalo : INTERVALO_MS;
      decorrido = 0;
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
      if (decorrido >= intervaloMs) {
        avancar(1);
        return;
      }
      const barra = document.getElementById("telao-barra");
      if (barra) barra.style.width = `${Math.min(100, (decorrido / intervaloMs) * 100)}%`;
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

    function telaClassificacao(tabela, vagas) {
      const tabelaDe = (linhas) => tabelaDoTelao(linhas, vagas);
      // --linhas: linhas por coluna; com jogadores demais, a altura da linha diminui para caber.
      const meio = Math.ceil(tabela.length / 2);
      return el("div", { class: "telao-duas-colunas", style: `--linhas: ${Math.max(meio, 1)}` },
        tabelaDe(tabela.slice(0, meio)), tabelaDe(tabela.slice(meio)));
    }

    // Fase de grupos: uma tabela por grupo, os grupos divididos em duas colunas (A e B na primeira...). Cada
    // grupo conta 2 linhas a mais em --linhas (título e cabeçalho), para tudo caber na altura.
    function telaClassificacaoDosGrupos(tabelas, k) {
      const meio = Math.ceil(tabelas.length / 2);
      const colunas = [tabelas.slice(0, meio), tabelas.slice(meio)];
      const linhas = Math.max(...colunas.map((c) => c.reduce((soma, t) => soma + t.linhas.length + 2, 0)), 1);
      return el("div", { class: "telao-duas-colunas telao-grupos", style: `--linhas: ${linhas}` },
        colunas.map((c) => el("div", { class: "telao-coluna-grupos" },
          c.map((t) => [el("h2", { class: "telao-titulo-grupo" }, `Grupo ${t.grupo}`), tabelaDoTelao(t.linhas, k)]))));
    }

    function tabelaDoTelao(linhas, vagas) {
      return el("table", { class: "telao-tabela" },
        el("thead", {}, el("tr", {},
          el("th", { class: "pos" }, ""), el("th", { class: "var" }, ""), el("th", { class: "nome" }, "Jogador"),
          ["Pts", "V", "SG", "GP", "J"].map((t) => el("th", {}, t)))),
        el("tbody", {}, linhas.map((l) => {
          let classe = l.posicao <= vagas ? "classificado" : "";
          if (l.posicao === vagas) classe += " corte";
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
    }

    // `jogos` = só os jogos da semana em andamento; a grade se ajusta ao número deles. `grupoDe`: id -> grupo,
    // só com fase de grupos (o rótulo do jogo diz o grupo).
    function telaJogos(jogos, grupoDe = null) {
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
          el("div", { class: "rotulo" }, `Jogo ${i + 1}`, grupoDe && grupoDe.get(jogo.dupla1[0]) ? ` · Grupo ${grupoDe.get(jogo.dupla1[0])}` : null,
            ehProximo && el("span", { class: "tag-proximo" }, "PRÓXIMO")),
          el("div", { class: `telao-dupla d1${classeDoLado(r, 1)}` }, nomesDupla(jogo.dupla1)),
          placar,
          el("div", { class: `telao-dupla d2${classeDoLado(r, 2)}` }, nomesDupla(jogo.dupla2)));
      }));
    }

    function confronto(c) {
      const vencedor = c.serie.vencedor;
      return el("div", { class: `telao-confronto${vencedor ? " decidido" : ""}` },
        el("div", { class: "rotulo" }, Regras.rotuloDoConfronto(c.chave), c.melhorDe > 1 ? ` · melhor de ${c.melhorDe}` : ""),
        [1, 2].map((lado) => {
          const dupla = c[`dupla${lado}`];
          let classe = "linha";
          if (vencedor === lado) classe += " vencedora";
          else if (vencedor) classe += " perdedora";
          return el("div", { class: classe },
            el("span", { class: dupla ? "nomes" : "nomes a-definir" },
              dupla ? nomesDupla(dupla) : c.origem[lado - 1],
              dupla && c[`lado${lado}`].manual ? el("sup", {}, "*") : null),
            el("span", { class: "valor" }, String(Exportar.valorDoLado(c, lado))));
        }),
        el("div", { class: "detalhe" }, Exportar.detalheDoConfronto(c)));
    }

    function podio(p, comTerceiro) {
      const degrau = (classe, medalha, titulo, dupla) => el("div", { class: `telao-degrau ${classe}${dupla ? "" : " vazio"}` },
        el("span", { class: "medalha" }, medalha),
        el("div", { class: "texto-degrau" },
          el("div", { class: "titulo" }, titulo),
          // Um jogador por linha: nome longo vira "…" em vez de empurrar os outros degraus para fora.
          el("div", { class: "nomes" }, dupla ? dupla.map((id) => el("div", { class: "nome" }, nomePorId.get(id))) : "a definir")));
      return el("div", { class: "telao-podio" },
        degrau("ouro", "🥇", "Campeões", p.campeoes),
        degrau("prata", "🥈", "Vice", p.vice),
        comTerceiro && degrau("bronze", "🥉", "3º lugar", p.terceiro));
    }

    // Uma coluna por rodada (a final leva o 3º lugar embaixo) e o pódio. Com muitas rodadas, as colunas
    // dividem a largura e os confrontos da 1ª rodada se comprimem (--n confrontos por coluna).
    function telaMataMata(mm) {
      const maior = Math.max(...mm.rodadas.map((r) => r.confrontos.length + (r.id === "final" && mm.terceiro ? 1 : 0)));
      const colunas = mm.rodadas.length + 1;
      return el("div", {
        class: `telao-chave${colunas !== 3 ? " varias" : ""}${maior > 3 ? " compacta" : ""}${maior > 5 ? " muitos" : ""}`,
        style: `--colunas: ${colunas}; --n: ${maior}`,
      },
        mm.rodadas.map((rodada) => el("div", { class: "coluna" },
          el("h2", {}, rodada.nome),
          rodada.confrontos.map(confronto),
          rodada.id === "final" && mm.terceiro && [el("h2", {}, "Disputa de 3º lugar"), confronto(mm.terceiro)])),
        el("div", { class: "coluna" }, el("h2", {}, "Pódio"), podio(mm.podio, Boolean(mm.terceiro))));
    }

    // ---------- render ----------

    function renderizar() {
      if (!ativo) return;
      const atual = estado.atual();
      const lista = telasDisponiveis();
      if (!lista.includes(telaAtual)) telaAtual = lista[0];
      const config = atual.campeonato.config;
      const base = Regras.baseDosJogadores(atual.campeonato.jogadores);
      nomePorId.clear();
      for (const l of base) nomePorId.set(l.id, l.nome);
      // Com grupos, a semeadura (é dela que o mata-mata tira as duplas); na liga única, a classificação.
      const ausentes = (atual.mataMata && atual.mataMata.ausentes) || [];
      const tabela = Regras.classificacaoDaFaseFinal(base, atual.jogos, atual.desempatesManuais, config, ausentes);
      const lancados = atual.jogos.filter((j) => j.resultado).length;

      let conteudo, complemento = "", titulo = TITULOS[telaAtual];
      if (telaAtual === "classificacao") {
        conteudo = Regras.usaGrupos(config)
          ? telaClassificacaoDosGrupos(Regras.classificacaoDosGrupos(base, atual.jogos, atual.desempatesManuais, config), config.grupos.classificados)
          : telaClassificacao(tabela, config.vagasFaseFinal);
        if (atual.jogos.length) complemento = lancados === atual.jogos.length ? "final" : `${lancados}/${atual.jogos.length} jogos lançados`;
      } else if (telaAtual === "jogos") {
        const semana = Regras.semanaAtual(atual.jogos, config);
        const daSemana = atual.jogos.filter((j) => Regras.semanaDoJogo(j) === semana);
        conteudo = telaJogos(daSemana, Regras.usaGrupos(config) ? new Map(atual.campeonato.jogadores.map((j) => [j.id, j.grupo])) : null);
        titulo = `${TITULOS.jogos} ${semana}`;
        complemento = `${daSemana.filter((j) => j.resultado).length}/${daSemana.length} lançados`;
      } else {
        conteudo = telaMataMata(Regras.resolverMataMata(atual.mataMata, tabela, config));
      }

      // Cor do campeonato: vira o fundo, escurecida para os verdes e o âmbar continuarem legíveis.
      const aparencia = estado.aparencia() || {};
      if (aparencia.cor) raiz.style.setProperty("--telao-fundo", `color-mix(in srgb, ${aparencia.cor} 45%, #050b12)`);
      else raiz.style.removeProperty("--telao-fundo");

      raiz.classList.toggle("pausado", pausado);
      raiz.replaceChildren(
        el("header", { class: "telao-topo" },
          aparencia.logo && el("img", { class: "telao-logo", src: aparencia.logo, alt: "" }),
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
      if (barra) barra.style.width = `${Math.min(100, (decorrido / intervaloMs) * 100)}%`;
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

    return { abrir, fechar, ativo: () => ativo, disponibilidade, definirSelecao };
  }

  globalThis.Telao = {
    criar, escolherTelas, lerPreferencia, gravarPreferencia, TELAS, TITULOS, INTERVALO_MS, INTERVALOS_MS, CHAVE_PREFERENCIA,
  };
})();
