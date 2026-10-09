// Renderização e eventos. Regras de negócio ficam em regras.js; estado em estado.js.

(function () {
  "use strict";

  const { el, formatarSaldo, classeDoLado } = Util;
  const { VAGAS_FASE_FINAL } = Regras;
  const MAX_GOLS = 99;
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

  // Texto digitado nos campos de placar e ainda não lançado (placar pela metade, inválido
  // ou em edição). Não vai para o estado; tem prioridade sobre o estado ao redesenhar.
  const rascunhos = new Map(); // id do jogo -> { 1: texto, 2: texto }
  const woAberto = new Set(); // ids de jogos com a escolha de W.O. aberta
  const rascunhosMM = new Map(); // id do campo do mata-mata -> texto inválido digitado
  let editandoDupla = null; // { chave, lado } da dupla do mata-mata em edição
  let focarAposId = null; // após Enter num placar do mata-mata, foca o campo seguinte a este

  function limparRascunhos() {
    renomeando = null;
    editandoSlot = null;
    rascunhos.clear();
    woAberto.clear();
    rascunhosMM.clear();
    editandoDupla = null;
  }

  // ---------- utilitários ----------

  function avisar(texto, tipo = "info") {
    const aviso = el("div", { class: `aviso ${tipo}`, role: tipo === "erro" ? "alert" : "status" }, texto);
    document.getElementById("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 8000 : 3500);
  }

  function lerGols(texto) {
    const t = texto.trim();
    if (t === "") return { vazio: true };
    if (!/^\d+$/.test(t) || Number(t) > MAX_GOLS) return { invalido: true };
    return { valor: Number(t) };
  }

  // ---------- campeonato e jogadores ----------

  let rascunhoNomes = ""; // nomes digitados/colados e ainda não adicionados
  let renomeando = null; // { id, valor } do jogador em edição
  let focoPendente = null; // id a focar depois do próximo redesenho
  let travadoAntes; // para abrir/fechar a seção quando o estado muda

  function cadastroTravado() {
    const atual = estado.atual();
    return Regras.cadastroTravado(atual.campeonato, atual.jogos);
  }

  function adicionarNomes() {
    if (cadastroTravado()) return;
    const campo = document.getElementById("novos-nomes");
    const nomes = Regras.interpretarListaNomes(campo ? campo.value : rascunhoNomes);
    if (!nomes.length) {
      avisar("Digite ao menos um nome (um por linha).", "erro");
      return;
    }
    const r = Regras.adicionarJogadores(estado.atual().campeonato.jogadores, nomes);
    for (const ignorado of r.ignorados) avisar(`"${ignorado.nome}" não foi adicionado: ${ignorado.motivo}`, "erro");
    rascunhoNomes = r.ignorados.map((i) => i.nome).join("\n"); // o que falhou fica no campo para corrigir
    focoPendente = "novos-nomes";
    if (!r.adicionados.length) {
      renderizar();
      return;
    }
    estado.modificar(`adicionar jogadores: ${r.adicionados.join(", ")}`, (s) => {
      s.campeonato.jogadores = r.jogadores;
      s.campeonato.sorteio = null;
    });
    avisar(`${r.adicionados.length} jogador(es) adicionado(s).`);
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
    const campo = document.getElementById(`nome-${id}`);
    const valor = campo ? campo.value : renomeando.valor;
    const r = Regras.renomearJogador(estado.atual().campeonato.jogadores, id, valor);
    if (r.erro) {
      renomeando.valor = valor;
      focoPendente = `nome-${id}`;
      avisar(r.erro, "erro");
      renderizar();
      return;
    }
    const antigo = nomePorId.get(id);
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
      avisar("O nome do campeonato não pode ficar vazio.", "erro");
      renderizar();
      return;
    }
    if (!estado.modificar("nome do campeonato", (s) => { s.campeonato.nome = nome; })) renderizar();
  }

  function mudarConfigInteira(campo, rotulo, texto) {
    if (cadastroTravado()) return;
    const t = texto.trim();
    const nova = { ...config(), [campo]: /^\d+$/.test(t) ? Number(t) : NaN };
    const erro = !(nova[campo] >= 1 && nova[campo] <= 99) ? "use um número de 1 a 99" : Regras.validarConfig(nova);
    if (erro) {
      avisar(`${rotulo}: ${erro}`, "erro");
      renderizar();
      return;
    }
    if (!estado.modificar(`${rotulo}: ${nova[campo]}`, (s) => {
      s.campeonato.config = nova;
      s.campeonato.sorteio = null;
    })) {
      renderizar();
    }
  }

  function campoConfig(classe, rotulo, entrada) {
    return el("label", { class: `campo-config ${classe}` }, rotulo, entrada);
  }

  function itemJogador(jogador, travado) {
    if (renomeando && renomeando.id === jogador.id) {
      return el("li", { class: "jogador editando" },
        el("input", {
          id: `nome-${jogador.id}`, type: "text", maxlength: String(Regras.MAX_CARACTERES_NOME), autocomplete: "off",
          value: renomeando.valor, "aria-label": `Novo nome de ${jogador.nome}`,
          oninput: (ev) => { renomeando.valor = ev.target.value; },
          onkeydown: (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); salvarRenomeacao(); }
            else if (ev.key === "Escape") { renomeando = null; renderizar(); }
          },
          onfocus: (ev) => ev.target.select(),
        }),
        el("button", { type: "button", id: `salvar-nome-${jogador.id}`, class: "primario mini", onclick: salvarRenomeacao }, "Salvar"),
        el("button", { type: "button", class: "discreto mini", onclick: () => { renomeando = null; renderizar(); } }, "Cancelar"));
    }
    return el("li", { class: "jogador", id: `jogador-${jogador.id}` },
      el("span", { class: "nome-jogador" }, jogador.nome),
      el("button", {
        type: "button", id: `renomear-${jogador.id}`, class: "discreto mini", title: `Renomear ${jogador.nome}`,
        onclick: () => { renomeando = { id: jogador.id, valor: jogador.nome }; focoPendente = `nome-${jogador.id}`; renderizar(); },
      }, "✎"),
      !travado && el("button", {
        type: "button", id: `remover-${jogador.id}`, class: "discreto mini perigo", title: `Remover ${jogador.nome}`,
        onclick: () => removerDoCadastro(jogador.id),
      }, "✕"));
  }

  function renderizarJogadores(atual) {
    const camp = atual.campeonato;
    const travado = Regras.cadastroTravado(camp, atual.jogos);
    const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
    if (renomeando && !camp.jogadores.some((j) => j.id === renomeando.id)) renomeando = null;

    const detalhes = document.getElementById("tela-jogadores");
    if (travado !== travadoAntes) {
      detalhes.open = !travado;
      travadoAntes = travado;
    }
    document.getElementById("resumo-jogadores").textContent =
      `${diag.jogadores} jogador(es)${travado ? " · calendário confirmado" : ""}`;

    const porSemana = diag.jogosPorSemanaMin === diag.jogosPorSemanaMax
      ? `${diag.jogosPorSemanaMax}` : `${diag.jogosPorSemanaMin} a ${diag.jogosPorSemanaMax}`;
    const numero = (id, campo, rotulo) => el("input", {
      id, type: "text", inputmode: "numeric", maxlength: "2", autocomplete: "off",
      value: String(camp.config[campo]), disabled: travado,
      onchange: (ev) => mudarConfigInteira(campo, rotulo, ev.target.value),
      onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
      onfocus: (ev) => ev.target.select(),
    });

    document.getElementById("conteudo-jogadores").replaceChildren(
      el("div", { class: "config-campeonato" },
        campoConfig("nome", "Nome do campeonato", el("input", {
          id: "nome-campeonato", type: "text", maxlength: "60", autocomplete: "off", value: camp.nome,
          onchange: mudarNomeDoCampeonato,
          onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
        })),
        campoConfig("numero", "Jogos por jogador", numero("config-jogos", "jogosPorJogador", "Jogos por jogador")),
        campoConfig("numero", "Semanas", numero("config-semanas", "semanas", "Semanas"))),
      el("p", { class: "diagnostico", id: "diagnostico" },
        `${diag.jogadores} jogadores × ${camp.config.jogosPorJogador} jogos ÷ 4 = ${diag.totalJogos} jogos · ${porSemana} por semana em ${camp.config.semanas} semanas`),
      diag.pronto
        ? el("p", { class: "tudo-certo" }, "✔ Combinação válida para sortear o calendário.")
        : el("ul", { class: "avisos-chave" }, diag.problemas.map((p) => el("li", {}, `⚠️ ${p}`))),
      travado
        ? el("div", { class: "alerta" },
            "Calendário confirmado: só é possível renomear jogadores. Para mudar a lista, reinicie o campeonato (exporte um backup antes).",
            el("button", { type: "button", id: "btn-reiniciar", class: "perigo", onclick: resetar }, "Reiniciar campeonato"))
        : el("div", { class: "adicionar-jogadores" },
            el("label", { for: "novos-nomes" }, "Adicionar jogadores (um nome por linha; Ctrl+Enter adiciona)"),
            el("textarea", {
              id: "novos-nomes", rows: "3", placeholder: "Jogador 1\nJogador 2\nJogador 3",
              oninput: (ev) => { rascunhoNomes = ev.target.value; },
              onkeydown: (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); adicionarNomes(); } },
            }, rascunhoNomes),
            el("div", { class: "acoes" },
              el("button", { type: "button", id: "btn-adicionar-nomes", class: "primario", onclick: adicionarNomes }, "Adicionar"))),
      camp.jogadores.length
        ? el("ol", { class: "lista-jogadores", id: "lista-jogadores" }, camp.jogadores.map((j) => itemJogador(j, travado)))
        : el("p", { class: "legenda" }, "Nenhum jogador cadastrado ainda."));
  }

  // ---------- calendário (sorteio) ----------

  let editandoSlot = null; // { indice, lado, pos } do jogador do rascunho em troca
  let confirmadoAntes; // para abrir/fechar a seção quando o estado muda

  function sortear() {
    if (cadastroTravado()) return;
    const atual = estado.atual();
    const { jogadores, config: cfg, sorteio } = atual.campeonato;
    if (sorteio && sorteio.rascunho && !confirm("Já existe um sorteio. Sortear de novo descarta esse calendário, inclusive as trocas manuais.\n\nSortear de novo?")) return;
    const semente = Math.floor(Math.random() * 2147483646) + 1;
    const r = Regras.gerarCalendario(jogadores, { jogosPorJogador: cfg.jogosPorJogador, semanas: cfg.semanas, semente });
    if (r.erro) {
      avisar(r.erro, "erro");
      return;
    }
    editandoSlot = null;
    estado.modificar(`sortear calendário (semente ${semente})`, (s) => {
      s.campeonato.sorteio = { semente, confirmado: false, rascunho: r.calendario };
    });
  }

  function descartarSorteio() {
    if (cadastroTravado()) return;
    editandoSlot = null;
    estado.modificar("descartar sorteio", (s) => { s.campeonato.sorteio = null; });
  }

  function confirmarCalendario() {
    const atual = estado.atual();
    const { jogadores, config: cfg, sorteio } = atual.campeonato;
    if (cadastroTravado() || !sorteio || !sorteio.rascunho) return;
    const aval = Regras.avaliarCalendario(jogadores, sorteio.rascunho, cfg);
    const aviso = aval.pronto ? "" : `Atenção, o calendário não respeita o regulamento:\n\n- ${aval.violacoes.join("\n- ")}\n\n`;
    if (!confirm(`${aviso}Confirmar o calendário? Depois disso só dá para renomear jogadores (Desfazer ainda volta, mas lançamentos feitos depois se perdem).`)) return;
    editandoSlot = null;
    estado.modificar("confirmar calendário", (s) => {
      s.jogos = Regras.calendarioParaJogos(sorteio.rascunho);
      s.campeonato.sorteio = { semente: sorteio.semente, confirmado: true };
    });
  }

  function trocarNoRascunho(indice, lado, pos, novoId) {
    const sorteio = estado.atual().campeonato.sorteio;
    editandoSlot = null;
    if (!sorteio || !sorteio.rascunho || !sorteio.rascunho[indice]) { renderizar(); return; }
    const jogo = sorteio.rascunho[indice];
    const antigo = jogo[`dupla${lado}`][pos];
    const novo = Regras.trocarJogadorNoCalendario(sorteio.rascunho, indice, lado, pos, novoId);
    if (!estado.modificar(`calendário (semana ${jogo.semana}): ${nomePorId.get(antigo)} → ${nomePorId.get(novoId)}`, (s) => {
      s.campeonato.sorteio.rascunho = novo;
    })) {
      renderizar();
    }
  }

  function seletorDeJogador(calendario, indice, lado, pos) {
    const jogo = calendario[indice];
    const doJogo = new Map(); // quem joga na semana -> número do jogo (1, 2...) dentro da semana
    let numero = 0;
    calendario.forEach((j, i) => {
      if (j.semana !== jogo.semana) return;
      numero++;
      for (const id of [...j.dupla1, ...j.dupla2]) doJogo.set(id, { numero, indice: i });
    });
    const atualId = jogo[`dupla${lado}`][pos];
    const jogadores = [...nomePorId].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    return el("select", {
      id: "troca-jogador", "aria-label": "Trocar jogador",
      onchange: (ev) => trocarNoRascunho(indice, lado, pos, ev.target.value),
    },
      jogadores.map(([id, nome]) => {
        const onde = doJogo.get(id);
        let rotulo = nome;
        if (id === atualId) rotulo += " (atual)";
        else if (onde) rotulo += ` — joga no jogo ${onde.numero} (trocam de lugar)`;
        else rotulo += " — descansa nesta semana";
        return el("option", { value: id, selected: id === atualId }, rotulo);
      }));
  }

  function nomeNoCalendario(calendario, indice, lado, pos, editavel) {
    const id = calendario[indice][`dupla${lado}`][pos];
    if (editavel && editandoSlot && editandoSlot.indice === indice && editandoSlot.lado === lado && editandoSlot.pos === pos) {
      return el("span", { class: "troca-slot" },
        seletorDeJogador(calendario, indice, lado, pos),
        el("button", { type: "button", class: "discreto mini", onclick: () => { editandoSlot = null; renderizar(); } }, "Cancelar"));
    }
    if (!editavel) return el("span", { class: "nome" }, nomePorId.get(id));
    return el("button", {
      type: "button", class: "nome-slot", title: `Trocar ${nomePorId.get(id)}`,
      id: `slot-${indice}-${lado}-${pos}`,
      onclick: () => { editandoSlot = { indice, lado, pos }; focoPendente = "troca-jogador"; renderizar(); },
    }, nomePorId.get(id));
  }

  function semanaDoCalendario(calendario, semana, editavel) {
    const doJogo = calendario.map((j, i) => ({ j, i })).filter(({ j }) => j.semana === semana);
    const jogam = new Set(doJogo.flatMap(({ j }) => [...j.dupla1, ...j.dupla2]));
    const descansam = [...nomePorId].filter(([id]) => !jogam.has(id)).map(([, nome]) => nome);
    return el("section", { class: "semana-calendario", id: `semana-${semana}` },
      el("h3", {}, `Semana ${semana} `, el("span", { class: "contagem" }, `(${doJogo.length} jogos)`)),
      el("ol", {}, doJogo.map(({ j, i }) => el("li", {},
        nomeNoCalendario(calendario, i, 1, 0, editavel), " + ", nomeNoCalendario(calendario, i, 1, 1, editavel),
        el("span", { class: "x" }, " × "),
        nomeNoCalendario(calendario, i, 2, 0, editavel), " + ", nomeNoCalendario(calendario, i, 2, 1, editavel)))),
      descansam.length
        ? el("p", { class: "descansam" }, `Descansam (${descansam.length}): ${descansam.join(", ")}`)
        : null);
  }

  function painelQualidade(aval, cfg) {
    const porSemana = aval.jogosPorSemana.join(" · ");
    return el("div", { class: "qualidade", id: "qualidade-calendario" },
      aval.pronto
        ? el("p", { class: "tudo-certo" },
            `✔ Regulamento respeitado: todos com ${cfg.jogosPorJogador} jogos, no máximo um por semana e nenhum parceiro repetido.`)
        : el("ul", { class: "avisos-chave" }, aval.violacoes.map((v) => el("li", {}, `⚠️ ${v}`))),
      el("p", { class: "legenda" },
        aval.adversariosRepetidos.pares
          ? `Adversários repetidos: ${aval.adversariosRepetidos.pares} par(es), no máximo ${aval.adversariosRepetidos.maxVezes} vezes (o sorteio evita, mas pode acontecer).`
          : "Adversários repetidos: nenhum.",
        ` Jogos por semana: ${porSemana}.`));
  }

  function renderizarCalendario(atual) {
    const camp = atual.campeonato;
    const confirmado = Regras.cadastroTravado(camp, atual.jogos);
    const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
    const rascunho = !confirmado && camp.sorteio ? camp.sorteio.rascunho || null : null;
    if (editandoSlot && (!rascunho || !rascunho[editandoSlot.indice])) editandoSlot = null;

    const detalhes = document.getElementById("tela-calendario");
    if (confirmado !== confirmadoAntes) {
      detalhes.open = !confirmado;
      confirmadoAntes = confirmado;
    }
    const resumo = document.getElementById("resumo-calendario");
    resumo.textContent = confirmado ? `confirmado · ${atual.jogos.length} jogos` : rascunho ? "sorteio em análise" : "";

    const calendario = confirmado ? atual.jogos : rascunho;
    const alvo = document.getElementById("conteudo-calendario");

    if (!calendario) {
      alvo.replaceChildren(
        el("p", { class: "legenda" },
          "Sorteia as duplas e os jogos de todas as semanas de uma vez: todos com o mesmo número de jogos, no máximo um por semana e sem repetir parceiro. Depois você pode trocar jogadores à mão e confirmar."),
        diag.pronto
          ? null
          : el("ul", { class: "avisos-chave" }, [el("li", {}, "⚠️ Antes de sortear, ajuste o cadastro:"), ...diag.problemas.map((p) => el("li", {}, p))]),
        el("button", { type: "button", id: "btn-sortear", class: "primario", disabled: !diag.pronto, onclick: sortear }, "🎲 Sortear calendário"));
      return;
    }

    const aval = Regras.avaliarCalendario(camp.jogadores, calendario, camp.config);
    const semanas = Array.from({ length: camp.config.semanas }, (_, i) => i + 1);
    alvo.replaceChildren(
      confirmado
        ? el("p", { class: "legenda" }, `Calendário confirmado${camp.sorteio ? ` (semente ${camp.sorteio.semente})` : ""}. Os jogos são lançados na seção de jogos.`)
        : el("div", { class: "acoes-calendario" },
            el("button", { type: "button", id: "btn-sortear", onclick: sortear }, "🎲 Sortear de novo"),
            el("button", { type: "button", id: "btn-confirmar-calendario", class: "primario", onclick: confirmarCalendario }, "✔ Confirmar calendário"),
            el("button", { type: "button", id: "btn-descartar-sorteio", class: "discreto", onclick: descartarSorteio }, "Descartar"),
            el("span", { class: "legenda" }, `Semente do sorteio: ${camp.sorteio.semente}. Clique num nome para trocar o jogador.`)),
      painelQualidade(aval, camp.config),
      el("div", { class: "semanas-calendario" }, semanas.map((n) => semanaDoCalendario(calendario, n, !confirmado))));
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

  // ---------- cartões de jogo ----------

  function cartaoJogo(jogo, numero) {
    const r = jogo.resultado;
    const ehWO = r && r.tipo === "wo";
    const anulado = r && r.tipo === "anulado";
    const rascunho = rascunhos.get(jogo.id);

    let valor1 = "", valor2 = "";
    if (ehWO) { valor1 = r.vencedor === 1 ? "3" : "0"; valor2 = r.vencedor === 2 ? "3" : "0"; }
    else if (anulado) { valor1 = "–"; valor2 = "–"; }
    else if (rascunho) { valor1 = rascunho[1]; valor2 = rascunho[2]; }
    else if (r) { valor1 = String(r.gols1); valor2 = String(r.gols2); }

    const entrada = (lado, valor) => el("input", {
      id: `gols-${jogo.id}-${lado}`,
      class: "gols" + (!anulado && lerGols(valor).invalido ? " invalido" : ""),
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      maxlength: "2",
      value: valor,
      disabled: ehWO || anulado,
      "aria-label": `Gols da dupla ${lado} no jogo ${numero}`,
      dataset: { jogo: jogo.id, lado: String(lado) },
      oninput: guardarRascunho,
      onchange: aoMudarPlacar,
      onkeydown: aoTeclarNoPlacar,
      onfocus: (ev) => ev.target.select(),
    });

    let status = "Pendente";
    if (ehWO) status = `W.O. – dupla ${r.vencedor} presente (3×0)`;
    else if (anulado) status = "Anulado – sem efeito na classificação";
    else if (r) status = "Lançado";

    const acoes = woAberto.has(jogo.id)
      ? el("div", { class: "jogo-acoes" },
          el("span", { class: "pergunta" }, "Qual dupla estava presente?"),
          el("button", { type: "button", id: `wo-${jogo.id}-1`, onclick: () => lancarWO(jogo.id, 1) }, "Dupla 1"),
          el("button", { type: "button", id: `wo-${jogo.id}-2`, onclick: () => lancarWO(jogo.id, 2) }, "Dupla 2"),
          el("button", {
            type: "button", id: `wo-${jogo.id}-cancelar`, class: "discreto",
            onclick: () => { woAberto.delete(jogo.id); renderizar(); },
          }, "Cancelar"))
      : el("div", { class: "jogo-acoes" },
          el("button", { type: "button", id: `wo-${jogo.id}`, onclick: () => { woAberto.add(jogo.id); renderizar(); } }, "W.O."),
          el("button", {
            type: "button", id: `anular-${jogo.id}`,
            title: "Fecha o jogo sem efeito: ninguém recebe pontos, V/E/D nem gols (ex.: W.O. das duas duplas)",
            onclick: () => anularJogo(jogo.id),
          }, "Anular"),
          el("button", {
            type: "button", id: `limpar-${jogo.id}`, class: "discreto",
            disabled: !r && !(rascunho && (rascunho[1] || rascunho[2])),
            onclick: () => limparJogo(jogo.id),
          }, "Limpar"));

    return el("article", { class: `jogo ${r ? "lancado" : "pendente"}`, id: `jogo-${jogo.id}` },
      el("div", { class: "jogo-topo" },
        el("span", { class: "jogo-numero" }, `Jogo ${numero}`),
        el("span", { class: "origem" }, `Semana ${jogo.semana}`),
        el("span", { class: "status" }, status)),
      el("div", { class: "jogo-placar" },
        el("div", { class: "dupla d1" + classeDoLado(r, 1) },
          jogo.dupla1.map((id) => el("span", { class: "nome" }, nomePorId.get(id)))),
        el("div", { class: "placar" }, entrada(1, valor1), el("span", { class: "x" }, "×"), entrada(2, valor2)),
        el("div", { class: "dupla d2" + classeDoLado(r, 2) },
          jogo.dupla2.map((id) => el("span", { class: "nome" }, nomePorId.get(id))))),
      acoes);
  }

  // ---------- rodadas (jogos por semana) ----------

  let semanaEscolhida = null; // semana exibida; começa na semana em andamento e depois só muda por escolha
  let agendaJogador = null; // jogador escolhido na agenda

  function reiniciarVisoes() {
    semanaEscolhida = null;
    semanaClassificacao = null;
    agendaJogador = null;
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

  function irParaSemana(n) {
    semanaEscolhida = n;
    renderizar();
  }

  function semanaExibida(atual) {
    const total = atual.campeonato.config.semanas;
    if (semanaEscolhida === null || semanaEscolhida < 1 || semanaEscolhida > total) {
      semanaEscolhida = Regras.semanaAtual(atual.jogos, atual.campeonato.config);
    }
    return semanaEscolhida;
  }

  function navegacaoSemanas(atual, semana) {
    const cfg = atual.campeonato.config;
    const progresso = Regras.progressoPorSemana(atual.jogos, cfg.semanas, cfg);
    const emAndamento = Regras.semanaAtual(atual.jogos, cfg);
    const rotulo = (p) => `Semana ${p.semana} (${p.resolvidos}/${p.total})`;

    const jogam = new Set(atual.jogos.filter((j) => Regras.semanaDoJogo(j) === semana).flatMap((j) => [...j.dupla1, ...j.dupla2]));
    const descansam = [...nomePorId].filter(([id]) => !jogam.has(id)).map(([, nome]) => nome);

    return el("div", { class: "navegacao-semanas" },
      el("div", { class: "seletor-semana" },
        el("button", { type: "button", id: "semana-anterior", title: "Semana anterior", disabled: semana <= 1, onclick: () => irParaSemana(semana - 1) }, "◀"),
        el("select", { id: "select-semana", "aria-label": "Semana", onchange: (ev) => irParaSemana(Number(ev.target.value)) },
          progresso.map((p) => el("option", { value: String(p.semana), selected: p.semana === semana }, rotulo(p)))),
        el("button", { type: "button", id: "semana-proxima", title: "Próxima semana", disabled: semana >= cfg.semanas, onclick: () => irParaSemana(semana + 1) }, "▶"),
        semana !== emAndamento && el("button", {
          type: "button", id: "semana-em-andamento", class: "discreto", onclick: () => irParaSemana(emAndamento),
        }, `Ir para a semana em andamento (${emAndamento})`)),
      el("div", { class: "chips-semanas" }, progresso.map((p) => {
        let classe = "chip-semana";
        if (p.total && p.resolvidos === p.total) classe += " completa";
        else if (p.resolvidos) classe += " parcial";
        if (p.semana === semana) classe += " selecionada";
        return el("button", { type: "button", id: `chip-semana-${p.semana}`, class: classe, title: rotulo(p), onclick: () => irParaSemana(p.semana) },
          `S${p.semana}`);
      })),
      descansam.length
        ? el("p", { class: "descansam" }, `Descansam na semana ${semana} (${descansam.length}): ${descansam.join(", ")}`)
        : null);
  }

  // Como o jogo ficou para quem estava no `lado` (1 ou 2).
  function resultadoParaLado(jogo, lado, cfg) {
    const r = jogo.resultado;
    const ef = Regras.efeitosDoResultado(r, cfg);
    if (!ef) return { texto: "pendente", classe: "pendente" };
    if (r.tipo === "anulado") return { texto: "anulado", classe: "anulada" };
    const e = ef[lado];
    const placar = `${e.gp}×${e.gc}${r.tipo === "wo" ? " (W.O.)" : ""}`;
    if (e.v) return { texto: `vitória ${placar}`, classe: "vencedora" };
    if (e.d) return { texto: `derrota ${placar}`, classe: "perdedora" };
    return { texto: `empate ${placar}`, classe: "empate" };
  }

  function agendaDoJogador(atual, tabela) {
    const cfg = atual.campeonato.config;
    if (agendaJogador && !nomePorId.has(agendaJogador)) agendaJogador = null;
    const ordenados = [...nomePorId].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    const seletor = el("select", {
      id: "select-agenda", "aria-label": "Jogador da agenda",
      onchange: (ev) => { agendaJogador = ev.target.value || null; renderizar(); },
    },
      el("option", { value: "" }, "— escolha um jogador —"),
      ordenados.map(([id, nome]) => el("option", { value: id, selected: id === agendaJogador }, nome)));

    let corpo = null;
    if (agendaJogador) {
      const numeros = numerosNaSemana(atual.jogos);
      const linhaDele = tabela.find((l) => l.id === agendaJogador);
      const jogosDele = atual.jogos.filter((j) => j.dupla1.includes(agendaJogador) || j.dupla2.includes(agendaJogador));
      corpo = el("div", {},
        el("p", { class: "legenda", id: "agenda-resumo" },
          `${linhaDele.posicao}º · ${linhaDele.pontos} pts · ${linhaDele.v}V ${linhaDele.e}E ${linhaDele.d}D · SG ${formatarSaldo(linhaDele.sg)} · ${jogosDele.length} jogos no calendário`),
        el("ol", { class: "agenda-lista" }, jogosDele.map((j) => {
          const lado = j.dupla1.includes(agendaJogador) ? 1 : 2;
          const minha = lado === 1 ? j.dupla1 : j.dupla2;
          const outra = lado === 1 ? j.dupla2 : j.dupla1;
          const parceiro = nomePorId.get(minha.find((id) => id !== agendaJogador));
          const r = resultadoParaLado(j, lado, cfg);
          return el("li", {},
            el("button", {
              type: "button", class: "nome-slot", title: "Ver esta semana", onclick: () => irParaSemana(Regras.semanaDoJogo(j)),
            }, `Semana ${Regras.semanaDoJogo(j)} · Jogo ${numeros.get(j.id)}`),
            ` com ${parceiro} × ${nomesDupla(outra)} `,
            el("span", { class: `resultado-agenda ${r.classe}` }, r.texto));
        })));
    }
    return el("div", { class: "agenda" },
      el("h3", {}, "Agenda do jogador"),
      el("label", { class: "campo-config" }, seletor),
      corpo);
  }

  function renderizarJogos(atual, tabela) {
    const lista = document.getElementById("lista-jogos");
    const navegacao = document.getElementById("navegacao-semanas");
    const agenda = document.getElementById("agenda-jogador");
    if (!atual.jogos.length) {
      navegacao.replaceChildren();
      agenda.replaceChildren();
      lista.replaceChildren(el("p", { class: "legenda" }, "Nenhum jogo ainda: cadastre os jogadores e sorteie o calendário."));
      document.getElementById("contador-jogos").textContent = "";
      return;
    }
    const semana = semanaExibida(atual);
    const numeros = numerosNaSemana(atual.jogos);
    navegacao.replaceChildren(navegacaoSemanas(atual, semana));
    lista.replaceChildren(...atual.jogos
      .filter((j) => Regras.semanaDoJogo(j) === semana)
      .map((jogo) => cartaoJogo(jogo, numeros.get(jogo.id))));
    agenda.replaceChildren(agendaDoJogador(atual, tabela));
    const lancados = atual.jogos.filter((j) => j.resultado).length;
    document.getElementById("contador-jogos").textContent = `${lancados}/${atual.jogos.length} lançados`;
  }

  // A cada tecla, guarda o texto dos dois campos do jogo (sem redesenhar).
  function guardarRascunho(ev) {
    const id = ev.target.dataset.jogo;
    rascunhos.set(id, {
      1: document.getElementById(`gols-${id}-1`).value,
      2: document.getElementById(`gols-${id}-2`).value,
    });
  }

  // Enter não dispara "change" fora de <form>: no 1º campo pula para o 2º; no 2º, lança.
  function aoTeclarNoPlacar(ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const { jogo: id, lado } = ev.target.dataset;
    if (lado === "1") document.getElementById(`gols-${id}-2`).focus();
    else ev.target.blur();
  }

  function aoMudarPlacar(ev) {
    guardarRascunho(ev);
    const id = ev.target.dataset.jogo;
    const rascunho = rascunhos.get(id);

    const g1 = lerGols(rascunho[1]), g2 = lerGols(rascunho[2]);
    if (g1.invalido || g2.invalido) {
      avisar(`Placar inválido no jogo ${id}: use números de 0 a ${MAX_GOLS}.`, "erro");
      renderizar();
      return;
    }

    if (g1.vazio || g2.vazio) {
      // Apagou um lado de um placar já lançado: o jogo volta a ficar pendente.
      if (!estado.modificar(`apagar placar do ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
        renderizar();
      }
      return;
    }

    rascunhos.delete(id);
    const resultado = { tipo: "placar", gols1: g1.valor, gols2: g2.valor };
    if (!estado.modificar(`placar do ${id}: ${g1.valor}×${g2.valor}`, (s) => {
      s.jogos.find((j) => j.id === id).resultado = resultado;
    })) {
      renderizar();
    }
  }

  function lancarWO(id, vencedor) {
    woAberto.delete(id);
    rascunhos.delete(id);
    if (!estado.modificar(`W.O. no ${id} (dupla ${vencedor} presente)`, (s) => {
      s.jogos.find((j) => j.id === id).resultado = { tipo: "wo", vencedor };
    })) {
      renderizar();
    }
  }

  function anularJogo(id) {
    rascunhos.delete(id);
    if (!estado.modificar(`anular ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = { tipo: "anulado" }; })) {
      renderizar();
    }
  }

  function limparJogo(id) {
    rascunhos.delete(id);
    if (!estado.modificar(`limpar ${id}`, (s) => { s.jogos.find((j) => j.id === id).resultado = null; })) {
      renderizar();
    }
  }

  // ---------- classificação ----------

  function definirOrdemManual(ordem) {
    const nomes = ordem.map((x) => nomePorId.get(x)).join(" > ");
    estado.modificar(`desempate manual: ${nomes}`, (s) => {
      s.desempatesManuais = Regras.definirOrdemDesempate(s.desempatesManuais, ordem);
    });
  }

  function moverNoDesempate(ordem, id, delta) {
    const nova = ordem.slice();
    const i = nova.indexOf(id), j = i + delta;
    [nova[i], nova[j]] = [nova[j], nova[i]];
    definirOrdemManual(nova);
  }

  function celulaJogador(linha, editavel) {
    const empate = linha.empateTecnico;
    if (!empate) return el("td", { class: "col-jogador" }, linha.nome);

    const nomes = empate.grupo.map((id) => nomePorId.get(id)).join(", ");
    const i = empate.grupo.indexOf(linha.id);
    const ultimo = empate.grupo.length - 1;
    return el("td", { class: "col-jogador" },
      linha.nome,
      el("span", {
        class: "empate" + (empate.ordemManual ? "" : " provisorio"),
        title: empate.ordemManual
          ? `Empate técnico (${nomes}). Ordem definida pelo organizador.`
          : `Empate técnico (${nomes}). Ordem alfabética provisória: defina com ↑↓ ou confirme com ✔.`,
      }, "⚖️"),
      editavel && el("span", { class: "controle-desempate" },
        el("button", {
          type: "button", id: `desempate-${linha.id}-sobe`, title: `Subir ${linha.nome} no desempate`,
          disabled: i === 0, onclick: () => moverNoDesempate(empate.grupo, linha.id, -1),
        }, "↑"),
        el("button", {
          type: "button", id: `desempate-${linha.id}-desce`, title: `Descer ${linha.nome} no desempate`,
          disabled: i === ultimo, onclick: () => moverNoDesempate(empate.grupo, linha.id, 1),
        }, "↓"),
        !empate.ordemManual && i === 0 && el("button", {
          type: "button", class: "confirmar", title: "Confirmar a ordem atual deste empate",
          onclick: () => definirOrdemManual(empate.grupo),
        }, "✔")));
  }

  function celulaVariacao(variacao) {
    if (variacao > 0) return el("td", { class: "col-var sobe", title: `Subiu ${variacao}` }, `▲${variacao}`);
    if (variacao < 0) return el("td", { class: "col-var desce", title: `Caiu ${-variacao}` }, `▼${-variacao}`);
    return el("td", { class: "col-var" });
  }

  // Semana escolhida para ver a classificação (null = ao vivo). Só leitura quando não é ao vivo.
  let semanaClassificacao = null;

  function controleClassificacao(ultimaSemana) {
    const alvo = document.getElementById("controle-classificacao");
    if (!ultimaSemana) {
      alvo.replaceChildren();
      return;
    }
    const opcoes = [el("option", { value: "", selected: semanaClassificacao === null }, "Atual (ao vivo)")];
    for (let n = 1; n <= ultimaSemana; n++) {
      opcoes.push(el("option", { value: String(n), selected: semanaClassificacao === n }, `Após a semana ${n}`));
    }
    alvo.replaceChildren(el("label", { class: "campo-config" }, "Ver classificação",
      el("select", {
        id: "select-semana-classificacao",
        onchange: (ev) => { semanaClassificacao = ev.target.value === "" ? null : Number(ev.target.value); renderizar(); },
      }, opcoes)));
  }

  function renderizarClassificacao(tabela, editavel) {
    document.getElementById("corpo-classificacao").replaceChildren(
      ...tabela.map((linha) => {
        let classe = linha.posicao <= VAGAS_FASE_FINAL ? "classificado" : "";
        if (linha.posicao === VAGAS_FASE_FINAL) classe += " linha-corte";
        if (linha.empateTecnico) classe += " em-empate";
        return el("tr", { class: classe.trim() || null },
          el("td", { class: "col-pos" }, `${linha.posicao}º`),
          celulaVariacao(linha.variacao),
          celulaJogador(linha, editavel),
          el("td", { class: "col-pts" }, String(linha.pontos)),
          el("td", {}, String(linha.v)),
          el("td", {}, String(linha.e)),
          el("td", {}, String(linha.d)),
          el("td", {}, String(linha.gp)),
          el("td", {}, String(linha.gc)),
          el("td", {}, formatarSaldo(linha.sg)),
          el("td", {}, String(linha.jogos)));
      })
    );
  }

  // ---------- o que está em jogo ----------

  // O cálculo enumera até Regras.MAX_CENARIOS_SITUACOES cenários: só refaz quando jogos,
  // desempates ou jogadores mudam. Devolve null se houver pendentes demais
  // (ver Regras.limitePendentesSituacoes).
  let cacheSituacoes = { chave: null, valor: null };
  function situacoesDe(atual) {
    const chave = JSON.stringify([atual.jogos.map((j) => j.resultado), atual.desempatesManuais, atual.campeonato]);
    if (cacheSituacoes.chave !== chave) {
      cacheSituacoes = {
        chave,
        valor: Regras.calcularSituacoes(classificacaoBase, atual.jogos, atual.desempatesManuais, atual.campeonato.config),
      };
    }
    return cacheSituacoes.valor;
  }

  function descreverProximoJogo(jogoId, jogadorId, jogos) {
    const jogo = jogos.find((j) => j.id === jogoId);
    const minha = jogo.dupla1.includes(jogadorId) ? jogo.dupla1 : jogo.dupla2;
    const outra = minha === jogo.dupla1 ? jogo.dupla2 : jogo.dupla1;
    const parceiro = nomePorId.get(minha.find((id) => id !== jogadorId));
    return `Semana ${Regras.semanaDoJogo(jogo)} · Jogo ${numerosNaSemana(jogos).get(jogoId)}: com ${parceiro} × ${nomesDupla(outra)}`;
  }

  function itemEmJogo(s, linha, jogos) {
    const detalhes = [];
    if (s.situacao === "disputa") {
      if (s.jogosPendentes.length) {
        const mais = s.jogosPendentes.length - 1;
        detalhes.push(el("div", { class: "proximo-jogo" },
          `Próximo: ${descreverProximoJogo(s.jogosPendentes[0], s.id, jogos)}`,
          mais > 0 && el("span", { class: "tag-repete", title: `Joga mais ${mais} depois deste` }, `+${mais}`)));
      } else {
        detalhes.push(el("div", { class: "nao-joga" }, "Não joga mais, só pode cair"));
      }
      const marcas = [];
      if (s.dependeDoSaldo) marcas.push(el("span", { class: "tag-saldo", title: "Pode empatar em pontos e vitórias na briga pela 8ª vaga" }, "depende do saldo"));
      if (s.dependeDoDesempate) marcas.push(el("span", { class: "tag-saldo", title: "Empate total com quem já terminou: defina a ordem na classificação (⚖️)" }, "⚖️ depende do desempate"));
      if (marcas.length) detalhes.push(el("div", { class: "marcas" }, marcas));
    }
    return el("li", { class: `item-em-jogo ${s.situacao}`, id: `em-jogo-${s.id}` },
      el("div", { class: "linha-item" },
        el("span", { class: "pos-item" }, `${linha.posicao}º`),
        el("span", { class: "nome-item" }, s.nome),
        el("span", { class: "pts-item" }, `${linha.pontos} pts · ${linha.v} V`)),
      detalhes);
  }

  function renderizarEmJogo(atual, tabela) {
    const pendentes = atual.jogos.filter((j) => !j.resultado).length;
    const situacoes = atual.jogos.length ? situacoesDe(atual) : null;
    if (!situacoes) {
      document.getElementById("resumo-em-jogo").textContent = "";
      document.getElementById("conteudo-em-jogo").replaceChildren(el("p", { class: "legenda mensagem-em-jogo" },
        atual.jogos.length
          ? `Disponível quando faltarem até ${Regras.limitePendentesSituacoes(atual.campeonato.config)} jogos (faltam ${pendentes}).`
          : "Ainda não há jogos."));
      return;
    }
    const porId = new Map(situacoes.map((s) => [s.id, s]));
    const colunas = { garantido: [], disputa: [], eliminado: [] };
    for (const linha of tabela) {
      const s = porId.get(linha.id);
      colunas[s.situacao].push(itemEmJogo(s, linha, atual.jogos));
    }
    document.getElementById("resumo-em-jogo").textContent = pendentes
      ? `${pendentes} jogo(s) pendente(s) · ${Regras.contarCenarios(pendentes, atual.campeonato.config).toLocaleString("pt-BR")} cenários`
      : "todos os jogos lançados";

    const coluna = (tipo, titulo) => el("div", { class: `coluna-em-jogo ${tipo}`, id: `coluna-${tipo}` },
      el("h3", {}, `${titulo} `, el("span", { class: "contagem" }, `(${colunas[tipo].length})`)),
      colunas[tipo].length
        ? el("ul", {}, colunas[tipo])
        : el("p", { class: "legenda" }, "Ninguém."));
    document.getElementById("conteudo-em-jogo").replaceChildren(
      coluna("garantido", "✅ Garantidos no top 8"),
      coluna("disputa", "⚔️ Em disputa"),
      coluna("eliminado", "❌ Eliminados"));
  }

  // ---------- mata-mata ----------

  const ROTULOS = { semi1: "Semifinal 1", semi2: "Semifinal 2", terceiro: "3º lugar", final: "Final" };
  const ORIGEM_DUPLA = {
    semi1: ["1º + 8º", "2º + 7º"],
    semi2: ["3º + 6º", "4º + 5º"],
    terceiro: ["Perdedor da Semi 1", "Perdedor da Semi 2"],
    final: ["Vencedor da Semi 1", "Vencedor da Semi 2"],
  };
  const NOMES_CAMPO = {
    gols: "tempo normal", prorrogacao: "prorrogação", penaltis: "pênaltis",
  };

  function nomesDupla(dupla) {
    return dupla.map((id) => nomePorId.get(id)).join(" + ");
  }

  // Depois de cada alteração, guarda as duplas que jogaram o 3º lugar e a final (ver
  // Regras.fixarDuplasJogadas): corrigir uma semi não passa esses placares para outra dupla.
  function modificarMataMata(descricao, alterar) {
    const mudou = estado.modificar(descricao, (s) => {
      s.mataMata = Regras.fixarDuplasJogadas(alterar(s.mataMata), tabelaAtual(), config());
    });
    if (!mudou) renderizar();
  }

  function painelGerar(atual, tabela) {
    if (tabela.length < Regras.VAGAS_FASE_FINAL) {
      return el("p", { class: "legenda" }, `O chaveamento precisa de pelo menos ${Regras.VAGAS_FASE_FINAL} jogadores cadastrados.`);
    }
    const avisos = Regras.avisosParaGerarChaveamento(atual.jogos, tabela, atual.campeonato.config);
    const semis = Regras.duplasDasSemis(tabela);
    const previa = (chave) => el("li", {},
      el("strong", {}, `${ROTULOS[chave]}: `),
      `${nomesDupla(semis[chave][0])} (${ORIGEM_DUPLA[chave][0]}) × ${nomesDupla(semis[chave][1])} (${ORIGEM_DUPLA[chave][1]})`);
    return el("div", { class: "gerar-chave" },
      el("p", {}, "Prévia pela classificação atual:"),
      el("ul", { class: "previa" }, previa("semi1"), previa("semi2")),
      avisos.length
        ? el("ul", { class: "avisos-chave" }, avisos.map((a) => el("li", {}, `⚠️ ${a}`)))
        : el("p", { class: "tudo-certo" }, "✔ Todos os jogos lançados e nenhum empate técnico pendente no top 8."),
      el("button", { type: "button", id: "btn-gerar-chave", class: "primario", onclick: gerarChaveamento }, "Gerar chaveamento"));
  }

  // Recalcula na hora do clique: um placar digitado logo antes pode ter mudado a classificação.
  function gerarChaveamento() {
    const tabela = tabelaAtual();
    const avisos = Regras.avisosParaGerarChaveamento(estado.atual().jogos, tabela, config());
    if (avisos.length && !confirm(`Atenção:\n\n- ${avisos.join("\n- ")}\n\nGerar o chaveamento mesmo assim?`)) return;
    estado.modificar("gerar chaveamento", (s) => { s.mataMata = Regras.gerarMataMata(tabela); });
  }

  function apagarChaveamento() {
    if (!confirm("Apagar o chaveamento, as duplas trocadas e todos os resultados do mata-mata?\n\nDá para voltar com \"Desfazer\".")) return;
    limparRascunhos();
    estado.modificar("apagar chaveamento", (s) => { s.mataMata = null; });
  }

  // Trocar duplas de um confronto que já tem placar: os placares ficam e passam a valer para as novas.
  function confirmarTrocaComPlacar(confrontos) {
    const comPlacar = confrontos.filter((c) => c.partidas.length && (c.lado1.desatualizada || c.lado2.desatualizada));
    if (!comPlacar.length) return true;
    return confirm(`${comPlacar.map((c) => ROTULOS[c.chave]).join(" e ")} já ${comPlacar.length > 1 ? "têm" : "tem"} placar lançado. `
      + "Os placares continuam e passam a valer para as novas duplas.\n\nTrocar as duplas mesmo assim?");
  }

  function barraMataMata(mm, tabela) {
    const semis = [mm.semi1, mm.semi2];
    const finais = [mm.final, mm.terceiro];
    const desatualizado = semis.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
    const finaisDesatualizadas = finais.some((c) => c.lado1.desatualizada || c.lado2.desatualizada);
    return el("div", { class: "barra-mata-mata" },
      desatualizado && el("div", { class: "alerta" },
        "⚠️ A classificação mudou depois de gerar o chaveamento: as duplas automáticas das semis não batem mais com ela. ",
        el("button", {
          type: "button", id: "btn-atualizar-semis",
          onclick: () => {
            if (!confirmarTrocaComPlacar(semis)) return;
            modificarMataMata("atualizar duplas das semis", (m) => Regras.atualizarDuplasDasSemis(m, tabelaAtual()));
          },
        }, "Usar duplas da classificação atual")),
      finaisDesatualizadas && el("div", { class: "alerta" },
        "⚠️ O resultado de uma semifinal mudou depois de lançar placares da final ou do 3º lugar: "
        + "as duplas que jogaram não são mais as que saem das semis. ",
        el("button", {
          type: "button", id: "btn-atualizar-finais",
          onclick: () => {
            if (!confirmarTrocaComPlacar(finais)) return;
            modificarMataMata("atualizar duplas da final e do 3º lugar", (m) => Regras.atualizarDuplasDasFinais(m, tabelaAtual(), config()));
          },
        }, "Usar duplas que saem das semis")),
      el("button", { type: "button", id: "btn-apagar-chave", class: "perigo discreto", onclick: apagarChaveamento }, "Apagar chaveamento"));
  }

  function editorDupla(c, lado, tabela) {
    const info = c[`lado${lado}`];
    const atual = info.dupla || [null, null];
    const seletor = (n) => el("select", { id: `sel-${c.chave}-${lado}-${n}`, "aria-label": `Jogador ${n} da dupla ${lado}` },
      el("option", { value: "" }, "— jogador —"),
      tabela.map((l) => el("option", { value: l.id, selected: l.id === atual[n - 1] }, `${l.posicao}º ${l.nome}`)));
    const sel1 = seletor(1), sel2 = seletor(2);

    const salvar = () => {
      const dupla = [sel1.value, sel2.value];
      const outra = c[`dupla${3 - lado}`];
      const erro = lado === 1 ? Regras.validarDuplas(dupla, outra) : Regras.validarDuplas(outra, dupla);
      if (erro) { avisar(erro, "erro"); return; }
      editandoDupla = null;
      modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} = ${nomesDupla(dupla)}`,
        (m) => Regras.definirDupla(m, c.chave, lado, dupla));
    };
    const voltar = () => {
      editandoDupla = null;
      modificarMataMata(`${ROTULOS[c.chave]}: dupla ${lado} volta à automática`,
        (m) => Regras.voltarDuplaAutomatica(m, c.chave, lado, tabelaAtual()));
    };

    return el("div", { class: "editor-dupla" },
      el("span", { class: "rotulo-lado" }, `Dupla ${lado}`),
      sel1, el("span", {}, "+"), sel2,
      el("button", { type: "button", id: `salvar-${c.chave}-${lado}`, class: "primario mini", onclick: salvar }, "Salvar"),
      info.manual && el("button", { type: "button", class: "mini", onclick: voltar }, "Voltar à automática"),
      el("button", { type: "button", class: "discreto mini", onclick: () => { editandoDupla = null; renderizar(); } }, "Cancelar"));
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
        info.dupla ? nomesDupla(info.dupla) : ORIGEM_DUPLA[c.chave][lado - 1]),
      info.dupla && !info.manual && el("span", { class: "origem-dupla" }, ORIGEM_DUPLA[c.chave][lado - 1]),
      info.manual && el("span", {
        class: "tag-manual",
        title: info.automatica ? `Automática seria: ${nomesDupla(info.automatica)}` : "Automática ainda indefinida",
      }, "alterada manualmente"),
      vencedora && el("span", { class: "tag-vence" }, "✔ vence"),
      el("button", {
        type: "button", id: `editar-${c.chave}-${lado}`, class: "discreto mini", title: "Trocar esta dupla",
        onclick: () => { editandoDupla = { chave: c.chave, lado }; renderizar(); },
      }, "✎"));
  }

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
      dataset: { chave: c.chave, indice: String(indice), campo },
      onchange: aoMudarPlacarMM,
      onkeydown: aoTeclarNoPlacarMM,
      onfocus: (ev) => ev.target.select(),
    });
  }

  function linhaPlacarMM(c, indice, etapa, partida) {
    const rotulo = NOMES_CAMPO[etapa];
    return el("div", { class: `linha-placar etapa-${etapa}` },
      el("span", { class: "rotulo-etapa" }, rotulo[0].toUpperCase() + rotulo.slice(1)),
      entradaMM(c, indice, `${etapa}1`, rotulo, partida),
      el("span", { class: "x" }, "×"),
      entradaMM(c, indice, `${etapa}2`, rotulo, partida));
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
        resultado = `✔ Dupla ${a.vencedor} vence`
          + (a.decididoEm === "prorrogacao" ? " na prorrogação" : a.decididoEm === "penaltis" ? " nos pênaltis" : "");
      } else if (a.erro) resultado = a.erro;
      else if (a.precisa === "prorrogacao") resultado = "Empate: lance a prorrogação.";
      else if (a.precisa === "penaltis") resultado = "Empate na prorrogação: lance os pênaltis.";

      blocos.push(el("div", { class: "partida" },
        c.melhorDe > 1 && el("div", { class: "titulo-partida" }, `Jogo ${i + 1}`),
        linhaPlacarMM(c, i, "gols", partida),
        mostrarProrrogacao && linhaPlacarMM(c, i, "prorrogacao", partida),
        mostrarPenaltis && linhaPlacarMM(c, i, "penaltis", partida),
        resultado && el("div", { class: "resultado-partida" + (a.erro ? " erro" : a.vencedor ? "" : " pendente") }, resultado)));
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

    return el("article", { class: `confronto${serie.vencedor ? " decidido" : ""}`, id: `mm-${c.chave}` },
      el("div", { class: "jogo-topo" },
        el("span", { class: "jogo-numero" }, ROTULOS[c.chave]),
        el("span", { class: "origem" }, c.melhorDe > 1 ? `Melhor de ${c.melhorDe}` : "Jogo único"),
        el("span", { class: "status" }, status)),
      linhaDupla(c, 1, tabela),
      linhaDupla(c, 2, tabela),
      erroDuplas && el("div", { class: "alerta" }, `⚠️ ${erroDuplas}`),
      c.melhorDe > 1 && c.pronto && el("div", { class: "placar-serie" },
        `Série: ${serie.vitorias[0]} × ${serie.vitorias[1]}`,
        !serie.vencedor && el("span", { class: "legenda" }, ` (vence quem fizer ${serie.necessarias})`)),
      c.pronto
        ? partidasDoConfronto(c)
        : el("p", { class: "legenda" }, "Os placares abrem quando as duas duplas estiverem definidas."));
  }

  function podio(p) {
    const degrau = (classe, medalha, titulo, dupla) => el("div", { class: `degrau ${classe}${dupla ? "" : " vazio"}` },
      el("span", { class: "medalha" }, medalha),
      el("div", {},
        el("div", { class: "titulo-degrau" }, titulo),
        dupla
          ? dupla.map((id) => el("div", { class: "nome-podio" }, nomePorId.get(id)))
          : el("div", { class: "a-definir" }, "a definir")));
    return el("div", { class: "podio", id: "podio" },
      degrau("ouro", "🥇", "Campeões", p.campeoes),
      degrau("prata", "🥈", "Vice", p.vice),
      degrau("bronze", "🥉", "3º lugar", p.terceiro));
  }

  function renderizarMataMata(atual, tabela) {
    const alvo = document.getElementById("conteudo-mata-mata");
    if (!atual.mataMata) {
      alvo.replaceChildren(painelGerar(atual, tabela));
      return;
    }
    const mm = Regras.resolverMataMata(atual.mataMata, tabela, atual.campeonato.config);
    alvo.replaceChildren(
      barraMataMata(mm, tabela),
      el("div", { class: "chave" },
        el("div", { class: "coluna-chave" },
          el("h3", {}, "Semifinais"),
          cartaoConfronto(mm.semi1, tabela),
          cartaoConfronto(mm.semi2, tabela)),
        el("div", { class: "coluna-chave" },
          el("h3", {}, "Final"),
          cartaoConfronto(mm.final, tabela),
          el("h3", {}, "Disputa de 3º lugar"),
          cartaoConfronto(mm.terceiro, tabela)),
        el("div", { class: "coluna-chave" },
          el("h3", {}, "Pódio"),
          podio(mm.podio))));
  }

  function aoMudarPlacarMM(ev) {
    const campoEl = ev.target;
    const { chave, campo } = campoEl.dataset;
    const indice = Number(campoEl.dataset.indice);
    const g = lerGols(campoEl.value);
    if (g.invalido) {
      rascunhosMM.set(campoEl.id, campoEl.value);
      avisar(`Placar inválido em ${ROTULOS[chave]}: use números de 0 a ${MAX_GOLS}.`, "erro");
      renderizar();
      return;
    }
    rascunhosMM.delete(campoEl.id);
    const valor = g.vazio ? null : g.valor;
    const jogo = Regras.MELHOR_DE[chave] > 1 ? ` jogo ${indice + 1}` : "";
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

  function focarCampoSeguinte() {
    const anterior = document.getElementById(focarAposId);
    focarAposId = null;
    if (!anterior) return;
    const campos = [...anterior.closest(".confronto").querySelectorAll("input")];
    const proximo = campos[campos.indexOf(anterior) + 1];
    if (proximo) proximo.focus();
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
      const semana = semanaClassificacao;
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
    const ultimaSemana = Regras.ultimaSemanaComResultado(atual.jogos, atual.campeonato.config);
    if (semanaClassificacao !== null && (ultimaSemana === null || semanaClassificacao > ultimaSemana)) semanaClassificacao = null;
    const tabelaVista = semanaClassificacao === null
      ? tabela
      : Regras.classificacaoPorSemana(classificacaoBase, atual.jogos, atual.desempatesManuais, atual.campeonato.config, semanaClassificacao);
    renderizarCabecalho(atual, tabela);
    renderizarLembreteBackup(atual);
    renderizarJogadores(atual);
    renderizarCalendario(atual);
    renderizarJogos(atual, tabela);
    controleClassificacao(ultimaSemana);
    document.getElementById("rotulo-classificacao").textContent = semanaClassificacao === null ? "" : `após a semana ${semanaClassificacao}`;
    renderizarClassificacao(tabelaVista, semanaClassificacao === null);
    renderizarEmJogo(atual, tabela);
    renderizarMataMata(atual, tabela);
    renderizarBarra();
    if (focoPendente) {
      const alvo = document.getElementById(focoPendente);
      focoPendente = null;
      if (alvo) alvo.focus();
    } else if (focarAposId) {
      focarCampoSeguinte();
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
