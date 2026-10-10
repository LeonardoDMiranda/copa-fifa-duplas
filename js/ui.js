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

  function avisar(texto, tipo = "info") {
    const aviso = el("div", { class: `aviso ${tipo}`, role: tipo === "erro" ? "alert" : "status" }, texto);
    document.getElementById("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 8000 : 3500);
  }

  function cadastroTravado() {
    const atual = estado.atual();
    return Regras.cadastroTravado(atual.campeonato, atual.jogos);
  }

  function nomesDupla(dupla) {
    return dupla.map((id) => nomePorId.get(id)).join(" + ");
  }

  // id do jogo -> número do jogo dentro da sua semana (1, 2...). Guardado enquanto a lista não muda.
  let cacheNumeros = { jogos: null, mapa: null };
  function numerosNaSemana(jogos) {
    if (cacheNumeros.jogos !== jogos) {
      const contagem = new Map();
      const mapa = new Map();
      for (const j of jogos) {
        const semana = Regras.semanaDoJogo(j);
        contagem.set(semana, (contagem.get(semana) || 0) + 1);
        mapa.set(j.id, contagem.get(semana));
      }
      cacheNumeros = { jogos, mapa };
    }
    return cacheNumeros.mapa;
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
    // Tela vazia ou etapa pendente: diz o que falta e leva até a aba onde se resolve.
    proximoPasso(texto, aba, rotulo) {
      return el("div", { class: "vazio" },
        el("p", {}, texto),
        aba && el("button", { type: "button", class: "primario", dataset: { ir: aba }, onclick: () => irParaAba(aba) }, rotulo));
    },
    cadastroTravado,
    nomesDupla,
    numerosNaSemana,
    tabelaAtual,
    limparRascunhos,
    resetar,
    sincronizarEdicao,
    novoCampeonato,
    exportarEdicao: exportar,
  };
  const telas = {
    jogadores: Telas.jogadores.criar(app),
    calendario: Telas.calendario.criar(app),
    rodadas: Telas.rodadas.criar(app),
    classificacao: Telas.classificacao.criar(app),
    emJogo: Telas.emJogo.criar(app),
    mataMata: Telas.mataMata.criar(app),
    campeonatos: Telas.campeonatos.criar(app),
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

  // Cada aba mostra uma ou mais telas; só as telas da aba visível são redesenhadas. As de etapa
  // têm botão na barra (teclas 1–5); a de campeonatos se abre pelo seletor do cabeçalho.
  const ABAS = [
    { id: "jogadores", telas: ["jogadores"] },
    { id: "calendario", telas: ["calendario"] },
    { id: "rodadas", telas: ["rodadas"] },
    { id: "classificacao", telas: ["classificacao", "emJogo"] },
    { id: "mata-mata", telas: ["mataMata"] },
    { id: "campeonatos", telas: ["campeonatos"], semBotao: true },
  ];
  const ABA_POR_ID = new Map(ABAS.map((a) => [a.id, a]));
  const ABAS_DE_ETAPA = ABAS.filter((a) => !a.semBotao);

  // A aba ativa fica no endereço (#rodadas...): voltar/avançar do navegador funciona.
  function abaDaUrl() {
    const id = decodeURIComponent(location.hash.slice(1));
    return ABA_POR_ID.has(id) ? id : null;
  }

  // Aba que interessa na etapa atual do campeonato.
  function abaDaEtapa(atual) {
    if (atual.mataMata) return "mata-mata";
    if (atual.jogos.length) return "rodadas";
    const camp = atual.campeonato;
    if (camp.sorteio || Regras.diagnosticarCampeonato(camp.jogadores, camp.config).pronto) return "calendario";
    return "jogadores";
  }

  function abaAtiva(atual) {
    return abaDaUrl() || abaDaEtapa(atual);
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
    const lancados = atual.jogos.filter((j) => j.resultado).length;
    const empatePendente = tabela.some((l) => l.empateTecnico && !l.empateTecnico.ordemManual);
    const campeoes = atual.mataMata && Regras.resolverMataMata(atual.mataMata, tabela, camp.config).podio.campeoes;
    const indicadores = {
      jogadores: camp.jogadores.length ? [String(camp.jogadores.length), `${camp.jogadores.length} jogadores`] : null,
      calendario: travado ? ["✔", "Calendário confirmado"] : camp.sorteio && camp.sorteio.rascunho ? ["rascunho", "Sorteio ainda não confirmado"] : null,
      rodadas: atual.jogos.length ? [`${lancados}/${atual.jogos.length}`, "Jogos lançados"] : null,
      classificacao: empatePendente ? ["⚖️", "Empate técnico no top 8 sem ordem definida"] : null,
      "mata-mata": campeoes ? ["🏆", "Campeões definidos"] : null,
    };
    for (const { id, semBotao } of ABAS) {
      const selecionada = id === ativa;
      document.getElementById(`aba-${id}`).hidden = !selecionada;
      if (semBotao) continue;
      const botao = document.getElementById(`aba-btn-${id}`);
      botao.setAttribute("aria-selected", String(selecionada));
      botao.tabIndex = selecionada ? 0 : -1;
      const indicador = document.getElementById(`indicador-${id}`);
      const [texto, titulo] = indicadores[id] || ["", ""];
      indicador.textContent = texto;
      indicador.title = titulo;
    }
  }

  // ---------- cabeçalho e lembrete de backup ----------

  let lembreteDispensado = null; // mensagem do lembrete que o organizador dispensou

  function renderizarCabecalho(atual, tabela) {
    const camp = atual.campeonato;
    const n = camp.jogadores.length;
    document.getElementById("titulo-campeonato").textContent = camp.nome;
    document.title = camp.nome;
    renderizarSeletor();

    let subtitulo;
    if (!n) {
      subtitulo = "Cadastre os jogadores para começar";
    } else if (!atual.jogos.length) {
      subtitulo = `${n} jogadores · ${camp.sorteio && camp.sorteio.rascunho ? "sorteio do calendário em análise" : "falta sortear o calendário"}`;
    } else if (atual.mataMata) {
      const campeoes = Regras.resolverMataMata(atual.mataMata, tabela, camp.config).podio.campeoes;
      subtitulo = campeoes ? `🏆 Campeões: ${campeoes.map((id) => nomePorId.get(id)).join(" e ")}` : "Fase final";
    } else {
      const lancados = atual.jogos.filter((j) => j.resultado).length;
      subtitulo = `Semana ${Regras.semanaAtual(atual.jogos, camp.config)} de ${camp.config.semanas} · ${lancados}/${atual.jogos.length} jogos lançados`;
    }
    document.getElementById("subtitulo-campeonato").textContent = subtitulo;
  }

  // Seletor de edições (título do cabeçalho): as não arquivadas, "Novo" e "Gerenciar".
  function renderizarSeletor() {
    const edicoes = campeonatos.listar().filter((c) => !c.arquivado);
    document.getElementById("itens-campeonatos").replaceChildren(
      el("p", { class: "menu-rotulo" }, "Campeonatos"),
      ...edicoes.map((c) => el("button", {
        type: "button", id: `seletor-${c.id}`, class: `item-edicao${c.ativo ? " edicao-ativa" : ""}`, "aria-current": c.ativo ? "true" : null,
        title: c.ativo ? "Campeonato aberto" : `Abrir "${c.nome}"`,
        onclick: () => { if (!c.ativo) abrirEdicao(c.id); },
      },
      el("span", { class: "marca-ativa", "aria-hidden": "true" }, c.ativo ? "✔" : ""),
      el("span", { class: "edicao-nome" }, c.nome),
      el("small", {}, c.situacao.texto))),
      el("hr"),
      el("button", { type: "button", id: "btn-novo-campeonato", onclick: novoCampeonato }, "+ Novo campeonato"),
      el("button", { type: "button", id: "btn-gerenciar-campeonatos", onclick: () => irParaAba("campeonatos") }, "⚙ Gerenciar campeonatos"));
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
      `💾 ${lembrete.mensagem}`,
      el("button", { type: "button", id: "btn-lembrete-exportar", class: "primario mini", onclick: () => exportar() }, "Exportar backup agora"),
      el("button", { type: "button", id: "btn-lembrete-dispensar", class: "discreto mini", onclick: () => { lembreteDispensado = lembrete.mensagem; renderizar(); } }, "Dispensar")));
  }

  // ---------- barra de ações ----------

  function renderizarBarra() {
    const ultima = estado.ultimaAcao();
    const botao = document.getElementById("btn-desfazer");
    botao.disabled = !ultima;
    botao.title = ultima ? `Desfazer: ${ultima} (Ctrl+Z)` : "Nada para desfazer";
    const pngMataMata = document.getElementById("btn-png-mata-mata");
    pngMataMata.disabled = !estado.atual().mataMata;
    pngMataMata.title = pngMataMata.disabled
      ? "Gere o chaveamento para exportar o mata-mata"
      : "Baixar o chaveamento como imagem (1080 px) para o grupo";

    const st = estado.status();
    const linha = document.getElementById("status-salvamento");
    linha.classList.toggle("erro", Boolean(st.erro));
    if (st.erro) linha.textContent = `⚠️ ${st.erro}`;
    else if (st.salvoEm) linha.textContent = `Salvo no navegador às ${st.salvoEm.toLocaleTimeString("pt-BR")}`;
    else linha.textContent = "Dados carregados do navegador";
  }

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
      });
      prefixo = `${base}-classificacao${semana === null ? "" : `-semana-${semana}`}`;
    } else {
      if (!atual.mataMata) { avisar("Gere o chaveamento antes de exportar o mata-mata.", "erro"); return; }
      canvas = Exportar.desenharMataMata(Regras.resolverMataMata(atual.mataMata, tabelaAtual(), cfg), nomePorId,
        { geradoEm: agora, nome: atual.campeonato.nome });
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
    const blob = new Blob([est.exportarJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: nome });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisar(`Backup exportado: ${nome}`);
    if (est !== estado) renderizar(); // o espaço usado mudou
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

  // Edição vazia: abre na aba Jogadores com o nome selecionado, pronto para digitar.
  function novoCampeonato() {
    campeonatos.novo();
    sincronizarEdicao("jogadores");
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
  document.getElementById("btn-resetar").addEventListener("click", resetar);
  document.getElementById("btn-png-classificacao").addEventListener("click", () => exportarPNG("classificacao"));
  document.getElementById("btn-png-mata-mata").addEventListener("click", () => exportarPNG("mata-mata"));
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

  // Abas: clique, setas ←→ dentro da lista e teclas 1–5 fora de campos de texto.
  const botoesAba = ABAS_DE_ETAPA.map(({ id }) => document.getElementById(`aba-btn-${id}`));
  for (const botao of botoesAba) botao.addEventListener("click", () => irParaAba(botao.dataset.aba));
  document.querySelector(".abas-lista").addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    ev.preventDefault();
    const i = botoesAba.indexOf(document.activeElement);
    const proximo = botoesAba[(i + (ev.key === "ArrowRight" ? 1 : botoesAba.length - 1)) % botoesAba.length];
    proximo.focus();
    irParaAba(proximo.dataset.aba);
  });
  window.addEventListener("hashchange", () => {
    if (abaDaUrl()) renderizar();
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
    } else if (/^[1-5]$/.test(ev.key) && !digitando && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      irParaAba(ABAS_DE_ETAPA[Number(ev.key) - 1].id);
    }
  });

  const st = estado.status();
  const stCampeonatos = campeonatos.status();
  if (stCampeonatos.aviso) avisar(stCampeonatos.aviso, "erro");
  if (st.aviso) avisar(st.aviso, "erro");
  if (st.erro) avisar(st.erro, "erro");
  if (!abaDaUrl()) fixarAbaDaEtapa();
  renderizarAgora();
  // index.html#telao: janela separada para a TV. Tela cheia exige um clique (botão ⛶).
  if (location.hash === "#telao") telao.abrir({ telaCheia: false });
})();
