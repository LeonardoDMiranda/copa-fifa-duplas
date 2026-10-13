// Orquestração da tela: cria o estado e as telas (js/telas/*.js), agenda o redesenho, cuida das
// abas, do cabeçalho (com o seletor de edições), do lembrete de backup e da barra de ações. Regras
// de negócio ficam em regras.js; estado de uma edição em estado.js; a lista de edições em campeonatos.js.

(function () {
  "use strict";

  const { el } = Util;
  // Jogadores e parâmetros vêm do estado (campeonato cadastrado pelo organizador).
  // sincronizarJogadores() refaz estes dois quando o estado muda.
  let classificacaoBase = [];
  const nomePorId = new Map();

  function config() {
    return estado.atual().campeonato.config;
  }

  function sincronizarJogadores() {
    classificacaoBase = Regras.baseDosJogadores(estado.atual().campeonato.jogadores);
    nomePorId.clear();
    for (const l of classificacaoBase) nomePorId.set(l.id, l.nome);
  }

  let armazenamento;
  try {
    armazenamento = window.localStorage;
  } catch (_) {
    armazenamento = null;
  }
  if (!armazenamento) {
    armazenamento = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => { throw new Error("localStorage indisponível"); },
      removeItem: () => {},
    };
  }
  // Edição ativa: vale para todas as janelas do app neste navegador (ver o evento "storage").
  const campeonatos = Campeonatos.criar(armazenamento);
  const estado = Estado.criar(armazenamento, campeonatos.chaveAtiva());

  let focoPendente = null; // { id, selecionar } a focar depois do próximo redesenho

  // ---------- utilitários compartilhados com as telas ----------

  // Aviso no canto da tela, para o que não tem um campo onde mostrar a mensagem. O de sucesso some
  // em 5 s; o de erro fica até ser fechado. A área #avisos é a única região anunciada (aria-live).
  const DURACAO_AVISO = 5000;
  function avisar(texto, tipo = "info") {
    const area = document.getElementById("avisos");
    // O mesmo aviso de novo: sai o antigo e entra o novo, no fim (e volta a ser anunciado).
    for (const antigo of area.querySelectorAll(".aviso")) {
      if (antigo.classList.contains(tipo) && antigo.querySelector(".aviso-texto").textContent === texto) antigo.remove();
    }
    const aviso = el("div", { class: `aviso ${tipo}` },
      Icones.svg(tipo === "erro" ? "alerta" : "ok"),
      el("span", { class: "aviso-texto" }, texto),
      Util.botaoIcone({ icone: "fechar", rotulo: "Fechar aviso", onclick: () => aviso.remove() }));
    area.appendChild(aviso);
    if (tipo !== "erro") setTimeout(() => aviso.remove(), DURACAO_AVISO);
  }

  function cadastroTravado() {
    const atual = estado.atual();
    return Regras.cadastroTravado(atual.campeonato, atual.jogos);
  }

  function nomesDupla(dupla) {
    return dupla.map((id) => nomePorId.get(id)).join(" + ");
  }

  // ---------- telas ----------

  const app = {
    estado,
    campeonatos,
    nomePorId,
    base: () => classificacaoBase,
    config,
    avisar,
    renderizar,
    focarDepois(id, { selecionar = false } = {}) { focoPendente = { id, selecionar }; },
    irParaAba,
    proximoPasso: (texto, aba, rotulo) => Util.proximoPasso(texto, aba, rotulo, irParaAba),
    cadastroTravado,
    nomesDupla,
    numerosNaSemana: Util.numerosNaSemana,
    tabelaAtual,
    limparRascunhos,
    resetar,
    sincronizarEdicao,
    novoCampeonato,
    exportarEdicao: exportar,
    exportarModelo,
    escolherArquivoParaImportar,
  };
  // Cada tela monta o próprio conteúdo dentro da <section> da sua aba (a Classificação e o
  // "O que está em jogo" dividem a mesma, nesta ordem).
  const raiz = (aba) => document.getElementById(`aba-${aba}`);
  const telas = {
    configuracao: Telas.configuracao.criar(app, raiz("configuracao")),
    jogadores: Telas.jogadores.criar(app, raiz("jogadores")),
    sorteio: Telas.sorteio.criar(app, raiz("sorteio")),
    rodadas: Telas.rodadas.criar(app, raiz("rodadas")),
    classificacao: Telas.classificacao.criar(app, raiz("classificacao")),
    emJogo: Telas.emJogo.criar(app, raiz("classificacao")),
    mataMata: Telas.mataMata.criar(app, raiz("mata-mata")),
    campeonato: Telas.campeonato.criar(app, raiz("campeonato")),
    campeonatos: Telas.campeonatos.criar(app, raiz("campeonatos")),
  };

  // Descarta o que foi digitado e não lançado em todas as telas (ex.: depois de desfazer).
  function limparRascunhos() {
    for (const tela of Object.values(telas)) if (tela.limparRascunhos) tela.limparRascunhos();
  }

  // Volta as telas para a visão padrão (semana em andamento, classificação ao vivo...).
  function reiniciarVisoes() {
    for (const tela of Object.values(telas)) if (tela.reiniciarVisao) tela.reiniciarVisao();
  }

  // ---------- abas ----------

  // As abas, as fases e o endereço que vale para cada etapa estão em js/abas.js (funções puras).
  const { ABAS, POR_ID: ABA_POR_ID, TODAS_AS_SECOES, abasDaFase, abaDaEtapa } = Abas;

  function abaDaUrl(atual) {
    return Abas.abaDoEndereco(location.hash.slice(1), atual);
  }

  function abaAtiva(atual) {
    return abaDaUrl(atual) || abaDaEtapa(atual);
  }

  function irParaAba(id) {
    if (location.hash !== `#${id}`) location.hash = id; // o "hashchange" redesenha
  }

  // Fixa no endereço a aba da etapa (ao abrir, resetar ou importar). Depois disso a aba só muda
  // quando o organizador escolhe: cadastrar o 8º jogador não tira ninguém da aba Jogadores.
  function fixarAbaDaEtapa() {
    if (location.hash === "#telao") return;
    history.replaceState(null, "", `#${abaDaEtapa(estado.atual())}`);
  }

  function renderizarAbas(atual, tabela, ativa) {
    const camp = atual.campeonato;
    const travado = Regras.cadastroTravado(camp, atual.jogos);
    const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
    const n = camp.jogadores.length;
    const lancados = atual.jogos.filter((j) => j.resultado).length;
    const empatePendente = tabela.some((l) => l.empateTecnico && !l.empateTecnico.ordemManual);
    const campeoes = atual.mataMata && Regras.resolverMataMata(atual.mataMata, tabela, camp.config).podio.campeoes;
    // Passo 1: jogos por jogador cabem nas semanas (o resto do diagnóstico depende dos jogadores).
    const configCompleta = !Regras.validarConfig(camp.config) && camp.config.jogosPorJogador <= camp.config.semanas;
    // { texto ou icone que aparece, leitor: o mesmo por extenso (entra no nome da aba e na dica) }
    const indicadores = {
      configuracao: configCompleta ? { icone: "confirmar", leitor: "configuração completa" } : { icone: "alerta", leitor: "configuração com problema" },
      jogadores: diag.pronto ? { icone: "confirmar", leitor: `${Util.plural(n, "jogador", "jogadores")}, pronto para sortear` }
        : n ? { texto: String(n), leitor: `${Util.plural(n, "jogador", "jogadores")}, falta acertar o cadastro` } : null,
      sorteio: travado ? { icone: "confirmar", leitor: "calendário confirmado" }
        : camp.sorteio && camp.sorteio.rascunho ? { texto: "rascunho", leitor: "sorteio ainda não confirmado" } : null,
      rodadas: atual.jogos.length ? { texto: `${lancados}/${atual.jogos.length}`, leitor: `${lancados} de ${atual.jogos.length} jogos lançados` } : null,
      classificacao: empatePendente ? { icone: "empate", leitor: "empate técnico no top 8 sem ordem definida" } : null,
      "mata-mata": campeoes ? { icone: "trofeu", leitor: "campeões definidos" } : null,
    };
    const visiveis = abasDaFase(atual);
    for (const { id } of ABAS) {
      const botao = document.getElementById(`aba-btn-${id}`);
      if (!botao) continue; // a de campeonatos não tem botão
      const posicao = visiveis.findIndex((a) => a.id === id);
      botao.hidden = posicao < 0;
      if (posicao < 0) continue;
      const selecionada = id === ativa;
      botao.setAttribute("aria-selected", String(selecionada));
      botao.tabIndex = selecionada ? 0 : -1;
      botao.setAttribute("aria-keyshortcuts", `Alt+${posicao + 1}`);
      botao.title = `Atalho: Alt+${posicao + 1}`;
      const indicador = document.getElementById(`indicador-${id}`);
      const ind = indicadores[id];
      if (ind) {
        indicador.replaceChildren(
          el("span", { "aria-hidden": "true" }, ind.icone ? Icones.svg(ind.icone) : ind.texto),
          el("span", { class: "so-leitor" }, `, ${ind.leitor}`));
        indicador.title = ind.leitor[0].toUpperCase() + ind.leitor.slice(1);
      } else {
        indicador.replaceChildren();
        indicador.title = "";
      }
    }
    const secoesVisiveis = new Set(ABA_POR_ID.get(ativa).secoes);
    for (const secao of TODAS_AS_SECOES) document.getElementById(`aba-${secao}`).hidden = !secoesVisiveis.has(secao);
  }

  // ---------- cabeçalho e lembrete de backup ----------

  let lembreteDispensado = null; // mensagem do lembrete que o organizador dispensou

  function renderizarCabecalho(atual, tabela) {
    const camp = atual.campeonato;
    const n = camp.jogadores.length;
    document.getElementById("titulo-campeonato").textContent = camp.nome;
    document.title = camp.nome;
    renderizarAparencia();
    renderizarSeletor();

    let subtitulo;
    if (!n) {
      subtitulo = ["Cadastre os jogadores para começar"];
    } else if (!atual.jogos.length) {
      subtitulo = [`${Util.plural(n, "jogador", "jogadores")} · ${camp.sorteio && camp.sorteio.rascunho ? "sorteio do calendário em análise" : "falta sortear o calendário"}`];
    } else if (atual.mataMata) {
      const campeoes = Regras.resolverMataMata(atual.mataMata, tabela, camp.config).podio.campeoes;
      subtitulo = campeoes ? [Icones.svg("trofeu"), ` Campeões: ${campeoes.map((id) => nomePorId.get(id)).join(" e ")}`] : ["Fase final"];
    } else {
      const lancados = atual.jogos.filter((j) => j.resultado).length;
      subtitulo = [`Semana ${Regras.semanaAtual(atual.jogos, camp.config)} de ${camp.config.semanas} · ${lancados}/${atual.jogos.length} jogos lançados`];
    }
    document.getElementById("subtitulo-campeonato").replaceChildren(...subtitulo);
  }

  // Cor do campeonato no fundo do cabeçalho (vale nos dois temas) e logo ao lado do título.
  function renderizarAparencia() {
    const ap = estado.aparencia() || {};
    if (ap.cor) document.documentElement.style.setProperty("--topo", ap.cor);
    else document.documentElement.style.removeProperty("--topo");
    const logo = document.getElementById("logo-campeonato");
    logo.hidden = !ap.logo;
    if (ap.logo) {
      if (logo.getAttribute("src") !== ap.logo) logo.src = ap.logo;
    } else {
      logo.removeAttribute("src");
    }
  }

  // Seletor de edições (botão "Trocar" ao lado do título): as não arquivadas, "Novo" e "Gerenciar".
  function renderizarSeletor() {
    const edicoes = campeonatos.listar().filter((c) => !c.arquivado);
    document.getElementById("itens-campeonatos").replaceChildren(
      el("p", { class: "menu-rotulo" }, "Campeonatos"),
      ...edicoes.map((c) => el("button", {
        type: "button", id: `seletor-${c.id}`, class: `item-edicao${c.ativo ? " edicao-ativa" : ""}`, "aria-current": c.ativo ? "true" : null,
        title: c.ativo ? "Campeonato aberto" : `Abrir "${c.nome}"`,
        onclick: () => { if (!c.ativo) abrirEdicao(c.id); },
      },
      el("span", { class: "marca-ativa" }, c.ativo ? Icones.svg("confirmar") : null),
      el("span", { class: "edicao-nome" }, c.nome),
      el("small", {}, c.situacao.texto))),
      el("hr"),
      el("button", { type: "button", id: "btn-novo-campeonato", onclick: novoCampeonato }, Icones.svg("novo"), "Novo campeonato"),
      el("button", { type: "button", id: "btn-gerenciar-campeonatos", onclick: () => irParaAba("campeonatos") },
        Icones.svg("configurar"), "Gerenciar campeonatos"));
  }

  function renderizarLembreteBackup(atual) {
    const alvo = document.getElementById("lembrete-backup");
    const lembrete = Regras.precisaDeBackup(atual.campeonato, atual.jogos, estado.ultimoBackup(), new Date());
    if (!lembrete || lembrete.mensagem === lembreteDispensado) {
      alvo.hidden = true;
      alvo.replaceChildren();
      return;
    }
    alvo.hidden = false;
    alvo.replaceChildren(el("div", { class: "alerta" },
      Icones.svg("backup"),
      el("span", {}, lembrete.mensagem),
      el("button", { type: "button", id: "btn-lembrete-exportar", class: "primario mini", onclick: () => exportar() }, "Exportar backup agora"),
      el("button", { type: "button", id: "btn-lembrete-dispensar", class: "discreto mini", onclick: () => { lembreteDispensado = lembrete.mensagem; renderizar(); } }, "Dispensar")));
  }

  // ---------- barra de ações ----------

  function renderizarBarra() {
    const ultima = estado.ultimaAcao();
    const botao = document.getElementById("btn-desfazer");
    botao.disabled = !ultima;
    botao.title = ultima ? `Desfazer: ${ultima} (Ctrl+Z)` : "Nada para desfazer";

    // A linha de status não é anunciada a cada salvamento; só o erro de salvamento vira aviso (uma vez).
    const st = estado.status();
    const linha = document.getElementById("status-salvamento");
    linha.classList.toggle("erro", Boolean(st.erro));
    if (st.erro) linha.replaceChildren(Icones.svg("alerta"), ` ${st.erro}`);
    else if (st.salvoEm) linha.textContent = `Salvo no navegador às ${st.salvoEm.toLocaleTimeString("pt-BR")}`;
    else linha.textContent = "Dados carregados do navegador";
    if (st.erro && st.erro !== erroSalvamentoAvisado) avisar(st.erro, "erro");
    erroSalvamentoAvisado = st.erro || null;
  }
  let erroSalvamentoAvisado = null;

  // Classificação ao vivo; a variação ▲▼ é em relação à semana anterior (ver Regras.classificacaoPorSemana).
  function calcularTabela(atual) {
    return Regras.classificacaoPorSemana(classificacaoBase, atual.jogos, atual.desempatesManuais, atual.campeonato.config);
  }

  function tabelaAtual() {
    return calcularTabela(estado.atual());
  }

  async function exportarPNG(tipo) {
    const atual = estado.atual();
    const cfg = atual.campeonato.config;
    const agora = new Date();
    const base = Util.slug(atual.campeonato.nome);
    const ap = estado.aparencia() || {};
    // Logo que não carrega não impede a imagem: sai sem ele.
    const logo = ap.logo ? await Util.carregarImagem(ap.logo).catch(() => null) : null;
    const visual = { cor: ap.cor, logo };
    let canvas, prefixo;
    if (tipo === "classificacao") {
      // Exporta o que está na tela: na aba Classificação, a semana escolhida; nas outras, ao vivo.
      const ultimaSemana = Regras.ultimaSemanaComResultado(atual.jogos, cfg);
      const vista = abaAtiva(atual) === "classificacao" ? telas.classificacao.semanaVista() : null;
      const semana = vista !== null && ultimaSemana !== null && vista <= ultimaSemana ? vista : null;
      const jogos = semana === null ? atual.jogos : atual.jogos.filter((j) => Regras.semanaDoJogo(j) <= semana);
      const tabela = semana === null ? tabelaAtual()
        : Regras.classificacaoPorSemana(classificacaoBase, atual.jogos, atual.desempatesManuais, cfg, semana);
      canvas = Exportar.desenharClassificacao(tabela, {
        geradoEm: agora,
        nome: atual.campeonato.nome,
        semana,
        lancados: jogos.filter((j) => j.resultado).length,
        totalJogos: jogos.length,
        ...visual,
      });
      prefixo = `${base}-classificacao${semana === null ? "" : `-semana-${semana}`}`;
    } else {
      if (!atual.mataMata) { avisar("Gere o chaveamento antes de exportar o mata-mata.", "erro"); return; }
      canvas = Exportar.desenharMataMata(Regras.resolverMataMata(atual.mataMata, tabelaAtual(), cfg), nomePorId,
        { geradoEm: agora, nome: atual.campeonato.nome, ...visual });
      prefixo = `${base}-mata-mata`;
    }
    try {
      const nome = await Exportar.baixarPNG(canvas, Exportar.nomeArquivo(prefixo, agora));
      avisar(`Imagem baixada: ${nome}`);
    } catch (erro) {
      avisar(`Não foi possível gerar a imagem: ${erro.message}`, "erro");
    }
  }

  function desfazer() {
    const descricao = estado.desfazer();
    if (descricao) {
      limparRascunhos();
      renderizar();
      avisar(`Desfeito: ${descricao}`);
    }
  }

  // Backup em JSON de uma edição (padrão: a ativa). Outra edição é lida e registrada direto na chave dela.
  function exportar(id = campeonatos.ativo()) {
    const agora = new Date();
    const est = id === campeonatos.ativo() ? estado : Estado.criar(armazenamento, Campeonatos.chaveDe(id));
    const atual = est.atual();
    const cfg = atual.campeonato.config;
    // O registro vai antes do JSON, para o arquivo já conter a data deste backup.
    est.registrarBackup({ em: agora.toISOString(), semanasCompletas: Regras.contarSemanasCompletas(atual.jogos, cfg.semanas, cfg) });
    const nome = `${Util.slug(atual.campeonato.nome)}-backup-${Util.carimbo(agora)}.json`;
    baixarJSON(nome, est.exportarJSON());
    avisar(`Backup exportado: ${nome}`);
    if (est !== estado) renderizar(); // o espaço usado mudou
  }

  function baixarJSON(nome, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const link = el("a", { href: url, download: nome });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Modelo (nome, configuração, jogadores, cor e logo) de uma edição, para começar outra igual.
  function exportarModelo(id) {
    try {
      const texto = campeonatos.exportarModelo(id);
      const nome = `${Util.slug(JSON.parse(texto).campeonato.nome)}-modelo-${Util.carimbo(new Date())}.json`;
      baixarJSON(nome, texto);
      avisar(`Modelo exportado: ${nome}`);
    } catch (erro) {
      avisar(`Não foi possível exportar o modelo: ${erro.message}`, "erro");
    }
  }

  // O mesmo campo de arquivo serve para backup e modelo: importar() reconhece o tipo.
  function escolherArquivoParaImportar() {
    document.getElementById("arquivo-importar").click();
  }

  // Modelo não substitui nada: vira uma edição nova direto, sem perguntar.
  function importarModelo(texto, arquivo) {
    try {
      campeonatos.criarDeModelo(texto);
    } catch (erro) {
      avisar(`Não foi possível usar o modelo: ${erro.message}`, "erro");
      return;
    }
    sincronizarEdicao("configuracao");
    avisar(`Campeonato criado a partir do modelo: ${arquivo.name}`);
  }

  function importar(ev) {
    const arquivo = ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    // Arquivo inválido é recusado antes de perguntar; válido, sempre pergunta como importar.
    leitor.onload = async () => {
      const texto = String(leitor.result);
      let importado;
      try {
        let obj;
        try { obj = JSON.parse(texto); } catch (_) { throw new Error("o arquivo não é um JSON válido."); }
        if (obj && obj.tipo === Estado.TIPO_MODELO) {
          importarModelo(texto, arquivo);
          return;
        }
        importado = Estado.validarEstado(obj);
      } catch (erro) {
        avisar(`Não foi possível importar: ${erro.message}`, "erro");
        return;
      }
      const escolha = await Util.escolher(
        `O arquivo "${arquivo.name}" traz "${importado.campeonato.nome}" (${importado.campeonato.jogadores.length} jogadores).\n\n`
        + `Ele pode entrar como um campeonato novo, ao lado dos outros, ou substituir o campeonato aberto ("${estado.atual().campeonato.nome}"). `
        + "Substituir dá para voltar com \"Desfazer\".",
        {
          titulo: "Importar backup",
          opcoes: [
            { valor: "substituir", id: "importar-substituir", rotulo: "Substituir o ativo" },
            { valor: "novo", id: "importar-novo", rotulo: "Importar como novo campeonato", classe: "primario" },
          ],
        }
      );
      try {
        if (escolha === "novo") {
          campeonatos.importarComoNovo(texto);
          sincronizarEdicao("etapa");
          avisar(`Backup importado como novo campeonato: ${arquivo.name}`);
        } else if (escolha === "substituir") {
          estado.importarJSON(texto);
          limparRascunhos();
          reiniciarVisoes();
          fixarAbaDaEtapa();
          renderizar();
          avisar(`Backup importado: ${arquivo.name}`);
        }
      } catch (erro) {
        avisar(`Não foi possível importar: ${erro.message}`, "erro");
      }
    };
    leitor.onerror = () => avisar("Não foi possível ler o arquivo.", "erro");
    leitor.readAsText(arquivo);
  }

  async function resetar() {
    const ok = await Util.confirmar(
      "Apaga o campeonato inteiro (jogadores, calendário, placares, W.O., desempates manuais e mata-mata) e volta ao cadastro vazio.\n\n"
      + "Dá para voltar com \"Desfazer\", mas é recomendável exportar um backup antes.",
      { titulo: "Resetar o campeonato?", acao: "Resetar", perigo: true }
    );
    if (!ok) return;
    limparRascunhos();
    reiniciarVisoes();
    estado.resetar();
    fixarAbaDaEtapa();
    renderizar();
    avisar("Campeonato reiniciado: tudo vazio.");
  }

  // ---------- edições ----------

  // Depois de mudar a lista de edições (aqui ou em outra janela): se a ativa mudou, carrega a nova.
  // `aba`: para onde ir quando troca ("etapa" = a aba da etapa da edição; null = fica onde está).
  function sincronizarEdicao(aba = "etapa") {
    if (estado.chave() !== campeonatos.chaveAtiva()) {
      lembreteDispensado = null;
      limparRascunhos();
      reiniciarVisoes();
      estado.trocarChave(campeonatos.chaveAtiva());
      const st = estado.status();
      if (st.aviso) avisar(st.aviso, "erro");
      if (aba === "etapa") fixarAbaDaEtapa();
      else if (aba && location.hash !== "#telao") irParaAba(aba);
    }
    renderizar();
  }

  function abrirEdicao(id) {
    try {
      campeonatos.abrir(id);
    } catch (erro) {
      avisar(`Não foi possível abrir: ${erro.message}`, "erro");
      return;
    }
    sincronizarEdicao("etapa");
    avisar(`Campeonato aberto: ${estado.atual().campeonato.nome}`);
  }

  // Edição vazia: abre na Configuração com o nome selecionado, pronto para digitar.
  function novoCampeonato() {
    campeonatos.novo();
    sincronizarEdicao("configuracao");
    app.focarDepois("nome-campeonato", { selecionar: true });
    avisar("Campeonato novo criado. Dê um nome e cadastre os jogadores.");
  }

  // ---------- render geral ----------

  // Adiado para depois do evento atual: assim o Tab já moveu o foco quando a tela é recriada.
  // Se o botão do mouse estiver pressionado (ex.: clicou num botão logo depois de digitar um
  // placar, e o "change" do campo pediu um redesenho), espera soltar: recriar o botão entre o
  // pressionar e o soltar faria o navegador descartar o clique.
  let renderAgendado = false;
  let mousePressionado = false;
  let renderEsperandoMouse = false;

  function renderizar() {
    if (renderAgendado) return;
    renderAgendado = true;
    setTimeout(executarRenderAgendado, 0);
  }

  function executarRenderAgendado() {
    if (mousePressionado) {
      renderEsperandoMouse = true;
      return;
    }
    renderAgendado = false;
    renderizarAgora();
  }

  function soltarMouse() {
    mousePressionado = false;
    if (!renderEsperandoMouse) return;
    renderEsperandoMouse = false;
    // O click é disparado logo após o pointerup, na mesma tarefa: o redesenho vem depois dele.
    setTimeout(executarRenderAgendado, 0);
  }

  // No <select>, a lista de opções do navegador pode engolir o pointerup: ele não entra na espera
  // (a escolha chega pelo "change", depois de soltar).
  document.addEventListener("pointerdown", (ev) => {
    if (ev.button === 0 && !(ev.target instanceof HTMLSelectElement)) mousePressionado = true;
  }, true);
  document.addEventListener("pointerup", soltarMouse, true);
  document.addEventListener("pointercancel", soltarMouse, true);
  window.addEventListener("blur", soltarMouse);

  function renderizarAgora() {
    // Guarda o foco para não perdê-lo ao recriar os elementos (ex.: Tab entre placares).
    const focoId = document.activeElement && document.activeElement.id;
    const selecao = selecaoDe(document.activeElement);
    const atual = estado.atual();
    const tabela = calcularTabela(atual);
    const aba = abaAtiva(atual);
    renderizarCabecalho(atual, tabela);
    renderizarLembreteBackup(atual);
    // Endereço antigo (#calendario) ou de outra fase (#rodadas sem calendário confirmado): acerta.
    if (location.hash !== "#telao" && location.hash !== `#${aba}`) history.replaceState(null, "", `#${aba}`);
    renderizarAbas(atual, tabela, aba);
    for (const nome of ABA_POR_ID.get(aba).telas) telas[nome].renderizar(atual, tabela);
    renderizarBarra();
    if (focoPendente) {
      const { id, selecionar } = focoPendente;
      const alvo = document.getElementById(id);
      focoPendente = null;
      if (alvo) {
        alvo.focus();
        if (selecionar && alvo.select) alvo.select();
      }
    } else if (telas.mataMata.focarCampoSeguinte()) {
      // o foco foi para o campo seguinte do mata-mata (Enter num placar)
    } else if (focoId) {
      const alvo = document.getElementById(focoId);
      if (alvo && !alvo.disabled && alvo !== document.activeElement) {
        alvo.focus();
        if (selecao) alvo.setSelectionRange(...selecao);
      }
    }
  }

  // Seleção de um campo de texto (para o campo recriado continuar com o mesmo trecho selecionado).
  function selecaoDe(campo) {
    if (!(campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement)) return null;
    try {
      return campo.selectionStart === null ? null : [campo.selectionStart, campo.selectionEnd];
    } catch (_) {
      return null;
    }
  }

  sincronizarJogadores();
  estado.aoMudar(sincronizarJogadores);
  estado.aoMudar(renderizar);
  const telao = Telao.criar(estado);

  // Outra janela do app (ex.: o telão na TV) salvou algo: relê para ficar em dia. Se ela trocou
  // a edição ativa, esta janela troca junto.
  window.addEventListener("storage", (ev) => {
    if (ev.key === Campeonatos.CHAVE_INDICE) {
      campeonatos.recarregar();
      sincronizarEdicao("etapa");
    } else if (ev.key === estado.chave()) {
      limparRascunhos();
      estado.recarregar();
    } else if (ev.key && ev.key.startsWith(Campeonatos.PREFIXO)) {
      renderizar(); // nome ou situação de outra edição (seletor e tela de campeonatos)
    }
  });

  document.getElementById("btn-desfazer").addEventListener("click", desfazer);
  document.getElementById("btn-exportar").addEventListener("click", () => exportar());
  document.getElementById("btn-importar").addEventListener("click", () => document.getElementById("arquivo-importar").click());
  document.getElementById("arquivo-importar").addEventListener("change", importar);
  document.getElementById("btn-campeonato-gerenciar").addEventListener("click", () => irParaAba("campeonatos"));
  document.getElementById("btn-telao").addEventListener("click", () => telao.abrir());

  // Menus do cabeçalho (<details>): fecham ao escolher um item, ao clicar fora e com Esc.
  const menus = [...document.querySelectorAll("details.menu")];
  function fecharMenus(exceto = null) {
    for (const menu of menus) if (menu !== exceto) menu.open = false;
  }
  for (const menu of menus) {
    menu.addEventListener("toggle", () => { if (menu.open) fecharMenus(menu); });
    menu.querySelector(".menu-itens").addEventListener("click", (ev) => {
      if (ev.target.closest("button")) menu.open = false;
    });
  }
  document.addEventListener("click", (ev) => {
    for (const menu of menus) if (menu.open && !menu.contains(ev.target)) menu.open = false;
  });

  // Ícones dos botões fixos do index.html (data-icone), antes do texto.
  for (const alvo of document.querySelectorAll("[data-icone]")) alvo.prepend(Icones.svg(alvo.dataset.icone));

  // "Pular para o conteúdo": só move o foco (o # do endereço guarda a aba).
  document.getElementById("pular-conteudo").addEventListener("click", (ev) => {
    ev.preventDefault();
    document.getElementById("conteudo-principal").focus();
  });

  // Abas: clique, setas ←→ dentro da lista e Alt+1... (as abas visíveis). Alt+número não digita nada,
  // então vale também com o foco num campo (atalho de uma tecla só atrapalharia quem digita).
  const botoesAba = [...document.querySelectorAll(".aba-btn")];
  for (const botao of botoesAba) botao.addEventListener("click", () => irParaAba(botao.dataset.aba));
  document.querySelector(".abas-lista").addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    const visiveis = botoesAba.filter((b) => !b.hidden);
    const i = visiveis.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const proximo = visiveis[(i + (ev.key === "ArrowRight" ? 1 : visiveis.length - 1)) % visiveis.length];
    proximo.focus();
    irParaAba(proximo.dataset.aba);
  });
  window.addEventListener("hashchange", () => {
    if (abaDaUrl(estado.atual())) renderizar();
  });

  document.addEventListener("keydown", (ev) => {
    if (telao.ativo() || document.querySelector("dialog[open]")) return;
    if (ev.key === "Escape" && menus.some((m) => m.open)) {
      const aberto = menus.find((m) => m.open);
      fecharMenus();
      aberto.querySelector("summary").focus();
      return;
    }
    const digitando = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement
      || ev.target instanceof HTMLTextAreaElement;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !digitando) {
      ev.preventDefault();
      desfazer();
    } else if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && /^Digit[1-9]$/.test(ev.code)) {
      ev.preventDefault();
      const aba = abasDaFase(estado.atual())[Number(ev.code.slice(-1)) - 1];
      if (aba) irParaAba(aba.id);
    }
  });

  const st = estado.status();
  const stCampeonatos = campeonatos.status();
  if (stCampeonatos.aviso) avisar(stCampeonatos.aviso, "erro");
  if (st.aviso) avisar(st.aviso, "erro");
  // st.erro (falha ao salvar) vira aviso no primeiro desenho da barra (renderizarBarra).
  if (!abaDaUrl(estado.atual())) fixarAbaDaEtapa();
  renderizarAgora();
  // index.html#telao: janela separada para a TV. Tela cheia exige um clique (botão ⛶).
  if (location.hash === "#telao") telao.abrir({ telaCheia: false });
})();
