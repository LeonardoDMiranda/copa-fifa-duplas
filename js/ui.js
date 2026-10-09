// Orquestração da tela: cria o estado e as telas (js/telas/*.js), agenda o redesenho, cuida do
// cabeçalho, do lembrete de backup e da barra de ações. Regras de negócio ficam em regras.js;
// estado em estado.js.

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
  const estado = Estado.criar(armazenamento || {
    getItem: () => null,
    setItem: () => { throw new Error("localStorage indisponível"); },
  });

  let focoPendente = null; // id a focar depois do próximo redesenho

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
    nomePorId,
    base: () => classificacaoBase,
    config,
    avisar,
    renderizar,
    focarDepois(id) { focoPendente = id; },
    cadastroTravado,
    nomesDupla,
    numerosNaSemana,
    tabelaAtual,
    limparRascunhos,
    resetar,
  };
  const telas = {
    jogadores: Telas.jogadores.criar(app),
    calendario: Telas.calendario.criar(app),
    rodadas: Telas.rodadas.criar(app),
    classificacao: Telas.classificacao.criar(app),
    emJogo: Telas.emJogo.criar(app),
    mataMata: Telas.mataMata.criar(app),
  };

  // Descarta o que foi digitado e não lançado em todas as telas (ex.: depois de desfazer).
  function limparRascunhos() {
    for (const tela of Object.values(telas)) if (tela.limparRascunhos) tela.limparRascunhos();
  }

  // Volta as telas para a visão padrão (semana em andamento, classificação ao vivo...).
  function reiniciarVisoes() {
    for (const tela of Object.values(telas)) if (tela.reiniciarVisao) tela.reiniciarVisao();
  }

  // ---------- cabeçalho e lembrete de backup ----------

  let lembreteDispensado = null; // mensagem do lembrete que o organizador dispensou

  function renderizarCabecalho(atual, tabela) {
    const camp = atual.campeonato;
    const n = camp.jogadores.length;
    document.getElementById("titulo-campeonato").textContent = camp.nome;
    document.title = camp.nome;

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
      el("button", { type: "button", id: "btn-lembrete-exportar", class: "primario mini", onclick: exportar }, "Exportar backup agora"),
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
      // Exporta o que está na tela: ao vivo ou "após a semana N".
      const semana = telas.classificacao.semanaVista();
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

  function exportar() {
    const agora = new Date();
    const atual = estado.atual();
    const cfg = atual.campeonato.config;
    // O registro vai antes do JSON, para o arquivo já conter a data deste backup.
    estado.registrarBackup({ em: agora.toISOString(), semanasCompletas: Regras.contarSemanasCompletas(atual.jogos, cfg.semanas, cfg) });
    const nome = `${Util.slug(atual.campeonato.nome)}-backup-${Util.carimbo(agora)}.json`;
    const blob = new Blob([estado.exportarJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: nome });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisar(`Backup exportado: ${nome}`);
  }

  function importar(ev) {
    const arquivo = ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        estado.importarJSON(String(leitor.result));
        limparRascunhos();
        reiniciarVisoes();
        renderizar();
        avisar(`Backup importado: ${arquivo.name}`);
      } catch (erro) {
        avisar(`Não foi possível importar: ${erro.message}`, "erro");
      }
    };
    leitor.onerror = () => avisar("Não foi possível ler o arquivo.", "erro");
    leitor.readAsText(arquivo);
  }

  function resetar() {
    const ok = confirm(
      "Resetar apaga o campeonato inteiro (jogadores, calendário, placares, W.O., desempates manuais e mata-mata) e volta ao cadastro vazio.\n\n"
      + "Dá para voltar com \"Desfazer\", mas é recomendável exportar um backup antes.\n\nResetar agora?"
    );
    if (!ok) return;
    limparRascunhos();
    reiniciarVisoes();
    estado.resetar();
    renderizar();
    avisar("Campeonato reiniciado: tudo vazio.");
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
    const atual = estado.atual();
    const tabela = calcularTabela(atual);
    renderizarCabecalho(atual, tabela);
    renderizarLembreteBackup(atual);
    telas.jogadores.renderizar(atual);
    telas.calendario.renderizar(atual);
    telas.rodadas.renderizar(atual, tabela);
    telas.classificacao.renderizar(atual, tabela);
    telas.emJogo.renderizar(atual, tabela);
    telas.mataMata.renderizar(atual, tabela);
    renderizarBarra();
    if (focoPendente) {
      const alvo = document.getElementById(focoPendente);
      focoPendente = null;
      if (alvo) alvo.focus();
    } else if (telas.mataMata.focarCampoSeguinte()) {
      // o foco foi para o campo seguinte do mata-mata (Enter num placar)
    } else if (focoId) {
      const alvo = document.getElementById(focoId);
      if (alvo && !alvo.disabled && alvo !== document.activeElement) alvo.focus();
    }
  }

  sincronizarJogadores();
  estado.aoMudar(sincronizarJogadores);
  estado.aoMudar(renderizar);
  const telao = Telao.criar(estado);

  // Outra janela do app (ex.: o telão na TV) salvou algo: relê para ficar em dia.
  window.addEventListener("storage", (ev) => {
    if (ev.key === Estado.CHAVE) {
      limparRascunhos();
      estado.recarregar();
    }
  });

  document.getElementById("btn-desfazer").addEventListener("click", desfazer);
  document.getElementById("btn-exportar").addEventListener("click", exportar);
  document.getElementById("btn-importar").addEventListener("click", () => document.getElementById("arquivo-importar").click());
  document.getElementById("arquivo-importar").addEventListener("change", importar);
  document.getElementById("btn-resetar").addEventListener("click", resetar);
  document.getElementById("btn-png-classificacao").addEventListener("click", () => exportarPNG("classificacao"));
  document.getElementById("btn-png-mata-mata").addEventListener("click", () => exportarPNG("mata-mata"));
  document.getElementById("btn-telao").addEventListener("click", () => telao.abrir());
  document.addEventListener("keydown", (ev) => {
    if (telao.ativo()) return;
    const digitando = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement
      || ev.target instanceof HTMLTextAreaElement;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !digitando) {
      ev.preventDefault();
      desfazer();
    }
  });

  const st = estado.status();
  if (st.aviso) avisar(st.aviso, "erro");
  if (st.erro) avisar(st.erro, "erro");
  renderizarAgora();
  // index.html#telao: janela separada para a TV. Tela cheia exige um clique (botão ⛶).
  if (location.hash === "#telao") telao.abrir({ telaCheia: false });
})();
