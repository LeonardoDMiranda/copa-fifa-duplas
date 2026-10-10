// Estado da aplicação: carregar/salvar no localStorage, desfazer, exportar/importar JSON.
// A classificação NUNCA é guardada aqui: ela é sempre calculada por regras.js.

(function () {
  "use strict";

  // Chave de uma edição só (até a Fase 12). Hoje cada edição tem a sua (ver campeonatos.js), que
  // migra desta; os dados do formato antigo (versão 1, campeonato 2026) seguem intactos no navegador.
  const CHAVE = "copa-fifa-duplas-campeonato";
  const VERSAO = 2;
  const MAX_HISTORICO = 30;
  const NOME_PADRAO = "Copa FIFA em Duplas";
  // Logo guardado como data URL: depois de reduzido (Util.prepararLogo) costuma ter poucos KB.
  const MAX_CARACTERES_LOGO = 80000;
  const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  const COR_VALIDA = /^#[0-9a-f]{6}$/;
  const TIPO_MODELO = "modelo-copa-fifa-duplas";
  const VERSAO_MODELO = 1;

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function campeonatoInicial() {
    return { nome: NOME_PADRAO, config: { ...Regras.REGRAS_PADRAO }, jogadores: [], sorteio: null };
  }

  // Campeonato novo: sem jogadores, sem calendário. A classificação base é derivada dos
  // jogadores (Regras.baseDosJogadores) e a classificação em si nunca é guardada.
  function estadoInicial() {
    return {
      versao: VERSAO,
      campeonato: campeonatoInicial(),
      jogos: [],
      desempatesManuais: [],
      mataMata: null,
      ultimoBackup: null,
      aparencia: null,
      historico: [],
    };
  }

  // Parte do estado que entra num snapshot do "desfazer".
  function conteudo(estado) {
    return {
      campeonato: clonar(estado.campeonato),
      jogos: clonar(estado.jogos),
      desempatesManuais: clonar(estado.desempatesManuais),
      mataMata: clonar(estado.mataMata),
    };
  }

  function textoNaoVazio(valor) {
    return typeof valor === "string" && valor.trim() !== "";
  }

  function validarCampeonato(c) {
    if (!c || typeof c !== "object") throw new Error("dados do campeonato ausentes.");
    if (!textoNaoVazio(c.nome)) throw new Error("nome do campeonato ausente.");
    const config = Regras.normalizarConfig(c.config);
    const erroConfig = Regras.validarConfig(config);
    if (erroConfig) throw new Error(`configuração inválida: ${erroConfig}`);
    if (!Array.isArray(c.jogadores)) throw new Error("lista de jogadores ausente.");
    const ids = new Set();
    const jogadores = c.jogadores.map((j) => {
      if (!j || !textoNaoVazio(j.id) || !textoNaoVazio(j.nome)) throw new Error("jogador sem id ou sem nome.");
      if (ids.has(j.id)) throw new Error(`jogador repetido: ${j.id}.`);
      ids.add(j.id);
      return { id: j.id, nome: j.nome.trim() };
    });
    let sorteio = null;
    if (c.sorteio !== null && c.sorteio !== undefined) {
      if (typeof c.sorteio !== "object" || !Number.isInteger(c.sorteio.semente)) throw new Error("sorteio inválido.");
      sorteio = { semente: c.sorteio.semente, confirmado: Boolean(c.sorteio.confirmado) };
      // O rascunho (calendário ainda não confirmado) só existe antes da confirmação.
      if (!sorteio.confirmado && c.sorteio.rascunho) sorteio.rascunho = validarRascunho(c.sorteio.rascunho, ids, config);
    }
    return { nome: c.nome.trim(), config, jogadores, sorteio };
  }

  // Calendário sorteado e ainda não confirmado: [{ semana, dupla1, dupla2 }]. Não exige que
  // respeite o regulamento (o organizador pode ter trocado jogadores à mão), só que esteja bem formado.
  function validarRascunho(rascunho, idsJogadores, config) {
    if (!Array.isArray(rascunho)) throw new Error("rascunho do sorteio inválido.");
    return rascunho.map((j) => {
      if (!j || !Number.isInteger(j.semana) || j.semana < 1 || j.semana > config.semanas) throw new Error("semana inválida no sorteio.");
      for (const dupla of [j.dupla1, j.dupla2]) {
        if (!Array.isArray(dupla) || dupla.length !== 2 || !dupla.every((id) => idsJogadores.has(id))) {
          throw new Error("dupla inválida no sorteio.");
        }
      }
      const erro = Regras.validarDuplas(j.dupla1, j.dupla2);
      if (erro) throw new Error(`sorteio: ${erro}`);
      return { semana: j.semana, dupla1: j.dupla1.slice(), dupla2: j.dupla2.slice() };
    });
  }

  // Mantém só os campos do resultado; lança Error se ele não for válido.
  function validarResultado(resultado, config, idJogo) {
    if (resultado === null || resultado === undefined) return null;
    if (!Regras.efeitosDoResultado(resultado, config)) throw new Error(`resultado inválido no jogo ${idJogo}.`);
    if (resultado.tipo === "anulado") return { tipo: "anulado" };
    if (resultado.tipo === "wo") return { tipo: "wo", vencedor: resultado.vencedor };
    return { tipo: "placar", gols1: resultado.gols1, gols2: resultado.gols2 };
  }

  function validarJogos(jogos, idsJogadores, config) {
    if (!Array.isArray(jogos)) throw new Error("lista de jogos ausente.");
    const vistos = new Set();
    return jogos.map((j) => {
      if (!j || !textoNaoVazio(j.id)) throw new Error("jogo sem id.");
      if (vistos.has(j.id)) throw new Error(`jogo repetido: ${j.id}.`);
      vistos.add(j.id);
      if (!Number.isInteger(j.semana) || j.semana < 1 || j.semana > config.semanas) {
        throw new Error(`semana inválida no jogo ${j.id} (o campeonato tem ${config.semanas} semanas).`);
      }
      for (const dupla of [j.dupla1, j.dupla2]) {
        if (!Array.isArray(dupla) || dupla.length !== 2 || !dupla.every((id) => idsJogadores.has(id))) {
          throw new Error(`dupla inválida no jogo ${j.id}.`);
        }
      }
      const erroDuplas = Regras.validarDuplas(j.dupla1, j.dupla2);
      if (erroDuplas) throw new Error(`jogo ${j.id}: ${erroDuplas}`);
      return {
        id: j.id,
        semana: j.semana,
        dupla1: j.dupla1.slice(),
        dupla2: j.dupla2.slice(),
        resultado: validarResultado(j.resultado, config, j.id),
      };
    });
  }

  // Valida o conteúdo vindo de fora (localStorage ou arquivo).
  // Lança Error com mensagem em português se algo estiver inválido.
  function validarConteudo(obj) {
    if (!obj || typeof obj !== "object") throw new Error("conteúdo vazio ou inválido.");
    const campeonato = validarCampeonato(obj.campeonato);
    const idsJogadores = new Set(campeonato.jogadores.map((j) => j.id));
    const jogos = validarJogos(obj.jogos, idsJogadores, campeonato.config);

    const desempates = obj.desempatesManuais ?? [];
    if (!Array.isArray(desempates)) throw new Error("desempatesManuais inválido.");
    for (const dm of desempates) {
      const ids = dm && dm.jogadores;
      if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length
          || !ids.every((id) => idsJogadores.has(id))) {
        throw new Error("desempate manual com jogadores inválidos.");
      }
    }

    return {
      campeonato,
      jogos,
      desempatesManuais: desempates.map((dm) => ({ jogadores: dm.jogadores.slice() })),
      mataMata: validarMataMata(obj.mataMata ?? null, idsJogadores),
    };
  }

  const CAMPOS_PARTIDA = ["gols1", "gols2", "prorrogacao1", "prorrogacao2", "penaltis1", "penaltis2"];

  function validarMataMata(mm, idsJogadores) {
    if (mm === null) return null;
    if (typeof mm !== "object") throw new Error("mataMata inválido.");
    const valido = {};
    for (const chave of Regras.CONFRONTOS) {
      const c = mm[chave];
      if (!c || typeof c !== "object") throw new Error(`mata-mata sem o confronto ${chave}.`);
      const dupla = (d) => {
        if (d === null || d === undefined) return null;
        if (!Array.isArray(d) || d.length !== 2 || !d.every((id) => idsJogadores.has(id))) {
          throw new Error(`dupla inválida no confronto ${chave}.`);
        }
        return d.slice();
      };
      if (!Array.isArray(c.partidas) || c.partidas.length > Regras.MELHOR_DE[chave]) {
        throw new Error(`partidas inválidas no confronto ${chave}.`);
      }
      const partidas = c.partidas.map((p) => {
        const nova = {};
        for (const campo of CAMPOS_PARTIDA) {
          if (!(campo in (p || {}))) continue;
          const v = p[campo];
          if (v !== null && !(Number.isInteger(v) && v >= 0)) throw new Error(`placar inválido no confronto ${chave}.`);
          nova[campo] = v;
        }
        return nova;
      });
      valido[chave] = {
        dupla1: dupla(c.dupla1),
        dupla2: dupla(c.dupla2),
        duplaManual1: Boolean(c.duplaManual1),
        duplaManual2: Boolean(c.duplaManual2),
        partidas: Regras.normalizarPartidas(partidas, Regras.MELHOR_DE[chave]),
      };
    }
    return valido;
  }

  // Registro do último backup exportado: { em: ISO, semanasCompletas }. Inválido vira null.
  function validarBackup(b) {
    if (!b || typeof b !== "object" || typeof b.em !== "string" || Number.isNaN(Date.parse(b.em))) return null;
    return { em: b.em, semanasCompletas: Number.isInteger(b.semanasCompletas) && b.semanasCompletas >= 0 ? b.semanasCompletas : 0 };
  }

  // Cor e logo do campeonato: { cor: "#rrggbb" | null, logo: data URL | null }, ou null (padrão).
  // Como o registro do backup, fica fora do desfazer (ver trocarDadosForaDoDesfazer). Parte
  // inválida (ou cor clara demais para o texto branco do cabeçalho) vira null.
  function validarAparencia(a) {
    if (!a || typeof a !== "object") return null;
    const cor = typeof a.cor === "string" && COR_VALIDA.test(a.cor.toLowerCase()) && Util.corLegivelComBranco(a.cor)
      ? a.cor.toLowerCase() : null;
    const logo = typeof a.logo === "string" && a.logo.length <= MAX_CARACTERES_LOGO && LOGO_VALIDO.test(a.logo) ? a.logo : null;
    return cor || logo ? { cor, logo } : null;
  }

  // Modelo de campeonato: nome, configuração, jogadores e aparência, sem calendário nem jogos.
  function modeloDoEstado(estado) {
    const { nome, config, jogadores } = estado.campeonato;
    return { tipo: TIPO_MODELO, versao: VERSAO_MODELO, campeonato: { nome, config, jogadores }, aparencia: estado.aparencia };
  }

  // Valida um modelo vindo de arquivo; devolve { campeonato, aparencia } ou lança Error.
  function validarModelo(obj) {
    if (!obj || typeof obj !== "object" || obj.tipo !== TIPO_MODELO) throw new Error("o arquivo não é um modelo de campeonato.");
    if (obj.versao !== VERSAO_MODELO) throw new Error(`versão ${obj.versao} do modelo não suportada (esperado ${VERSAO_MODELO}).`);
    const c = obj.campeonato;
    if (!c || typeof c !== "object") throw new Error("dados do campeonato ausentes.");
    return { campeonato: validarCampeonato({ nome: c.nome, config: c.config, jogadores: c.jogadores, sorteio: null }), aparencia: validarAparencia(obj.aparencia) };
  }

  function validarEstado(obj) {
    if (!obj || typeof obj !== "object") throw new Error("arquivo não contém um objeto JSON.");
    if (obj.versao === 1) {
      throw new Error("este backup é do formato antigo (versão 1, campeonato de 2026) e não é compatível com este.");
    }
    if (obj.versao !== VERSAO) throw new Error(`versão ${obj.versao} não suportada (esperado ${VERSAO}).`);
    const historico = [];
    for (const snap of Array.isArray(obj.historico) ? obj.historico : []) {
      try {
        const entrada = { descricao: String(snap.descricao || "alteração"), ...validarConteudo(snap) };
        if ("ultimoBackup" in snap) entrada.ultimoBackup = validarBackup(snap.ultimoBackup);
        if ("aparencia" in snap) entrada.aparencia = validarAparencia(snap.aparencia);
        historico.push(entrada);
      } catch (_) {
        // snapshot antigo inválido: descarta só ele
      }
    }
    return {
      versao: VERSAO,
      ...validarConteudo(obj),
      ultimoBackup: validarBackup(obj.ultimoBackup),
      aparencia: validarAparencia(obj.aparencia),
      historico: historico.slice(-MAX_HISTORICO),
    };
  }

  // Cria o gerenciador de estado sobre um armazenamento com a interface do localStorage
  // (getItem/setItem). Os testes passam um armazenamento em memória. `chave` é a da edição
  // (ver campeonatos.js); sem ela, vale a chave de antes das várias edições.
  function criar(armazenamento, chave = CHAVE) {
    let estado;
    const ouvintes = [];
    const status = { salvoEm: null, erro: null, aviso: null };

    function salvar() {
      try {
        armazenamento.setItem(chave, JSON.stringify(estado));
        status.salvoEm = new Date();
        status.erro = null;
      } catch (erro) {
        status.erro = `Não foi possível salvar no navegador (${erro.message}). Exporte o JSON como backup.`;
      }
    }

    function notificar() {
      for (const fn of ouvintes) fn(estado);
    }

    function carregar() {
      let bruto = null;
      try {
        bruto = armazenamento.getItem(chave);
      } catch (erro) {
        status.erro = `Não foi possível ler o armazenamento do navegador (${erro.message}).`;
      }
      if (!bruto) {
        estado = estadoInicial();
        return;
      }
      try {
        estado = validarEstado(JSON.parse(bruto));
      } catch (erro) {
        // Guarda o conteúdo corrompido antes de recomeçar, para não perder nada.
        try { armazenamento.setItem(`${chave}-corrompido-${Date.now()}`, bruto); } catch (_) { /* sem espaço */ }
        status.aviso = `Os dados salvos estavam inválidos (${erro.message}) e foram guardados à parte. O app recomeçou da base.`;
        estado = estadoInicial();
        salvar();
      }
    }

    // Aplica uma alteração num rascunho do estado. Se algo mudou, empilha o estado
    // anterior no histórico, descarta ordens manuais que deixaram de valer e salva.
    function modificar(descricao, alterar) {
      const antes = conteudo(estado);
      const rascunho = conteudo(estado);
      alterar(rascunho);
      rascunho.desempatesManuais = Regras.podarDesempatesManuais(
        Regras.baseDosJogadores(rascunho.campeonato.jogadores), rascunho.jogos, rascunho.desempatesManuais,
        rascunho.campeonato.config
      );
      if (JSON.stringify(rascunho) === JSON.stringify(antes)) return false;

      const historico = [...estado.historico, { descricao, ...antes }].slice(-MAX_HISTORICO);
      estado = { versao: VERSAO, ...rascunho, ultimoBackup: estado.ultimoBackup, aparencia: estado.aparencia, historico };
      salvar();
      notificar();
      return true;
    }

    function desfazer() {
      if (!estado.historico.length) return null;
      const historico = estado.historico.slice();
      const entrada = historico.pop();
      const { descricao, ultimoBackup: registroAnterior, aparencia: aparenciaAnterior, ...anterior } = entrada;
      // Só resetar e importar guardam esses dados na entrada (ver trocarDadosForaDoDesfazer).
      const ultimoBackup = "ultimoBackup" in entrada ? registroAnterior : estado.ultimoBackup;
      const aparencia = "aparencia" in entrada ? aparenciaAnterior : estado.aparencia;
      estado = { versao: VERSAO, ...clonar(anterior), ultimoBackup, aparencia, historico };
      salvar();
      notificar();
      return descricao;
    }

    function importarJSON(texto) {
      let obj;
      try {
        obj = JSON.parse(texto);
      } catch (erro) {
        throw new Error("o arquivo não é um JSON válido.");
      }
      const importado = validarEstado(obj);
      const mudou = modificar("importar backup", (s) => {
        s.campeonato = importado.campeonato;
        s.jogos = importado.jogos;
        s.desempatesManuais = importado.desempatesManuais;
        s.mataMata = importado.mataMata;
      });
      // Registro do backup e aparência são do campeonato: passa a valer o que veio no arquivo.
      trocarDadosForaDoDesfazer({ ultimoBackup: importado.ultimoBackup, aparencia: importado.aparencia }, mudou);
    }

    function resetar() {
      const inicial = estadoInicial();
      const mudou = modificar("resetar", (s) => {
        s.campeonato = inicial.campeonato;
        s.jogos = inicial.jogos;
        s.desempatesManuais = inicial.desempatesManuais;
        s.mataMata = inicial.mataMata;
      });
      // Campeonato novo: o backup e a aparência do anterior não valem para ele.
      trocarDadosForaDoDesfazer({ ultimoBackup: null, aparencia: null }, mudou);
      return mudou;
    }

    // Registro do backup e aparência ficam fora do desfazer, mas são do campeonato: trocam junto
    // com ele (resetar, importar). Se a ação entrou no histórico, a entrada guarda os valores
    // anteriores que mudaram: desfazer a ação devolve o campeonato com eles.
    function trocarDadosForaDoDesfazer(novos, entrouNoHistorico) {
      const anteriores = {};
      for (const [campo, valor] of Object.entries(novos)) {
        if (JSON.stringify(estado[campo]) !== JSON.stringify(valor)) anteriores[campo] = estado[campo];
      }
      if (!Object.keys(anteriores).length) return;
      let historico = estado.historico;
      if (entrouNoHistorico) {
        historico = historico.slice();
        historico[historico.length - 1] = { ...historico[historico.length - 1], ...anteriores };
      }
      estado = { ...estado, ...novos, historico };
      salvar();
      notificar();
    }

    // Cor e logo: valem na hora e não entram no desfazer (o logo repetido em cada passo do
    // histórico ocuparia espaço demais). Devolve false se nada mudou.
    function definirAparencia(aparencia) {
      const nova = validarAparencia(aparencia);
      if (JSON.stringify(nova) === JSON.stringify(estado.aparencia)) return false;
      estado = { ...estado, aparencia: nova };
      salvar();
      notificar();
      return true;
    }

    // O registro do backup não entra no desfazer (exportar e depois desfazer não "desexporta").
    function registrarBackup(info) {
      estado = { ...estado, ultimoBackup: validarBackup(info) };
      salvar();
      notificar();
    }

    function exportarJSON() {
      return JSON.stringify({ ...estado, exportadoEm: new Date().toISOString() }, null, 2);
    }

    carregar();

    // Relê o armazenamento (ex.: outra janela do app salvou uma alteração) e avisa a tela.
    function recarregar() {
      carregar();
      notificar();
    }

    // Passa a trabalhar com outra edição (outra chave). Ouvintes continuam os mesmos.
    function trocarChave(nova) {
      chave = nova;
      status.salvoEm = null;
      status.erro = null;
      status.aviso = null;
      recarregar();
    }

    return {
      atual: () => estado,
      chave: () => chave,
      recarregar,
      trocarChave,
      modificar,
      desfazer,
      ultimaAcao: () => (estado.historico.length ? estado.historico[estado.historico.length - 1].descricao : null),
      exportarJSON,
      registrarBackup,
      ultimoBackup: () => estado.ultimoBackup,
      aparencia: () => estado.aparencia,
      definirAparencia,
      importarJSON,
      resetar,
      status: () => ({ ...status }),
      aoMudar(fn) { ouvintes.push(fn); },
    };
  }

  globalThis.Estado = {
    criar, CHAVE, MAX_HISTORICO, VERSAO, MAX_CARACTERES_LOGO, TIPO_MODELO,
    estadoInicial, validarEstado, validarAparencia, modeloDoEstado, validarModelo,
  };
})();
