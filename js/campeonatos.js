// Várias edições do campeonato guardadas no navegador: um índice (quais existem, qual está ativa,
// quais estão arquivadas) e uma chave por edição, no formato do estado v2 (estado.js). Nome e
// situação de cada edição são lidos dela mesma, não ficam repetidos no índice.

(function () {
  "use strict";

  const CHAVE_INDICE = "copa-fifa-duplas-indice";
  const PREFIXO = "copa-fifa-duplas-campeonato-";
  const PREFIXO_APP = "copa-fifa-duplas";
  const ID_VALIDO = /^[a-z0-9]{1,40}$/;
  const CHAVE_DE_EDICAO = /^copa-fifa-duplas-campeonato-([a-z0-9]{1,40})$/;
  const MAX_CARACTERES_NOME = 60;
  const LIMITE_BYTES = 5 * 1024 * 1024; // o que os navegadores costumam dar ao localStorage

  function chaveDe(id) {
    return PREFIXO + id;
  }

  // Cria o gerenciador de edições sobre um armazenamento com a interface do localStorage
  // (getItem/setItem/removeItem/key/length). `agora` existe para os testes.
  function criar(armazenamento, { agora = () => new Date() } = {}) {
    let indice; // { ativo, campeonatos: [{ id, criadoEm, arquivado }] }, na ordem de criação
    const status = { aviso: null, erro: null };
    const resumos = new Map(); // id -> { bruto, resumo }: evita reler a mesma edição a cada desenho

    function ler(chave) {
      try {
        return armazenamento.getItem(chave);
      } catch (_) {
        return null;
      }
    }

    function gravar(chave, valor) {
      try {
        armazenamento.setItem(chave, valor);
        return true;
      } catch (erro) {
        status.erro = `Não foi possível salvar no navegador (${erro.message}). Exporte o JSON como backup.`;
        return false;
      }
    }

    function chavesGuardadas() {
      const chaves = [];
      try {
        for (let i = 0; i < armazenamento.length; i++) chaves.push(armazenamento.key(i));
      } catch (_) {
        // armazenamento indisponível: nada guardado
      }
      return chaves.filter((k) => typeof k === "string");
    }

    function salvarIndice() {
      gravar(CHAVE_INDICE, JSON.stringify(indice));
    }

    function novoId() {
      const usados = new Set(indice ? indice.campeonatos.map((c) => c.id) : []);
      let id;
      do {
        id = agora().getTime().toString(36) + Math.random().toString(36).slice(2, 6);
      } while (usados.has(id) || ler(chaveDe(id)) !== null);
      return id;
    }

    function dataValida(texto) {
      return typeof texto === "string" && !Number.isNaN(Date.parse(texto)) ? texto : null;
    }

    // Entradas inválidas, repetidas ou sem os dados da edição são descartadas.
    function validarIndice(obj) {
      if (!obj || typeof obj !== "object" || !Array.isArray(obj.campeonatos)) throw new Error("lista de campeonatos ausente");
      const vistos = new Set();
      const campeonatos = [];
      for (const c of obj.campeonatos) {
        if (!c || !ID_VALIDO.test(c.id) || vistos.has(c.id) || ler(chaveDe(c.id)) === null) continue;
        vistos.add(c.id);
        campeonatos.push({ id: c.id, criadoEm: dataValida(c.criadoEm), arquivado: Boolean(c.arquivado) });
      }
      return { ativo: obj.ativo, campeonatos };
    }

    // Edições que existem no armazenamento (para refazer um índice perdido). A data de criação
    // não é conhecida.
    function edicoesGuardadas() {
      return chavesGuardadas().map((k) => CHAVE_DE_EDICAO.exec(k)).filter(Boolean)
        .map((m) => ({ id: m[1], criadoEm: null, arquivado: false }));
    }

    // Primeira abertura com várias edições: o campeonato da chave de antes vira a primeira
    // edição. A chave antiga fica intacta.
    function migrar() {
      const antigo = ler(Estado.CHAVE);
      if (!antigo) return [];
      const id = novoId();
      gravar(chaveDe(id), antigo);
      return [{ id, criadoEm: agora().toISOString(), arquivado: false }];
    }

    function criarEdicao(estado) {
      const id = novoId();
      gravar(chaveDe(id), JSON.stringify(estado));
      indice.campeonatos.push({ id, criadoEm: agora().toISOString(), arquivado: false });
      indice.ativo = id;
      return id;
    }

    // A ativa precisa existir e não estar arquivada; senão vale a última não arquivada e, se não
    // houver nenhuma, uma edição vazia nova.
    function garantirAtivo() {
      const disponiveis = indice.campeonatos.filter((c) => !c.arquivado);
      if (disponiveis.some((c) => c.id === indice.ativo)) return;
      if (disponiveis.length) indice.ativo = disponiveis[disponiveis.length - 1].id;
      else criarEdicao(Estado.estadoInicial());
    }

    function carregar() {
      const bruto = ler(CHAVE_INDICE);
      indice = null;
      if (bruto) {
        try {
          indice = validarIndice(JSON.parse(bruto));
        } catch (erro) {
          gravar(`${CHAVE_INDICE}-corrompido-${Date.now()}`, bruto);
          status.aviso = `A lista de campeonatos estava inválida (${erro.message}) e foi refeita a partir das edições guardadas.`;
        }
      }
      if (!indice) {
        const guardadas = edicoesGuardadas();
        indice = { ativo: null, campeonatos: [] };
        indice.campeonatos = guardadas.length ? guardadas : migrar();
      }
      garantirAtivo();
      if (JSON.stringify(indice) !== bruto) salvarIndice();
    }

    function buscar(id) {
      const c = indice.campeonatos.find((x) => x.id === id);
      if (!c) throw new Error("campeonato não encontrado.");
      return c;
    }

    // Lê e valida uma edição guardada (sem o histórico do desfazer, que não interessa aqui).
    function lerEdicao(id) {
      const obj = JSON.parse(ler(chaveDe(id)));
      return Estado.validarEstado({ ...obj, historico: [] });
    }

    function resumo(id) {
      const bruto = ler(chaveDe(id));
      const guardado = resumos.get(id);
      if (guardado && guardado.bruto === bruto) return guardado.resumo;
      let r;
      try {
        const estado = lerEdicao(id);
        r = { nome: estado.campeonato.nome, situacao: Regras.situacaoDoCampeonato(estado), jogadores: estado.campeonato.jogadores.length };
      } catch (_) {
        r = { nome: "Campeonato com dados inválidos", situacao: { etapa: "invalido", texto: "dados inválidos" }, jogadores: 0 };
      }
      resumos.set(id, { bruto, resumo: r });
      return r;
    }

    function listar() {
      return indice.campeonatos.map((c) => ({ ...c, ativo: c.id === indice.ativo, ...resumo(c.id) }));
    }

    // "Copa (2)", ou "(3)" se "(2)" já existir...
    function nomeDuplicado(nome) {
      const usados = new Set(listar().map((c) => c.nome));
      const base = nome.replace(/ \(\d+\)$/, "");
      for (let n = 2; ; n++) {
        const sufixo = ` (${n})`;
        const candidato = base.slice(0, MAX_CARACTERES_NOME - sufixo.length).trimEnd() + sufixo;
        if (!usados.has(candidato)) return candidato;
      }
    }

    // Toda ação relê o índice antes: outra janela do app pode ter mudado a lista.
    function alterar(fn) {
      carregar();
      const r = fn();
      garantirAtivo();
      salvarIndice();
      return r;
    }

    function novo() {
      return alterar(() => criarEdicao(Estado.estadoInicial()));
    }

    // Nova edição com o nome, a configuração, os jogadores e a aparência da escolhida; sem
    // calendário, jogos nem mata-mata (o cadastro fica livre).
    function duplicar(id) {
      return alterar(() => {
        buscar(id);
        const origem = lerEdicao(id);
        const c = origem.campeonato;
        const estado = Estado.estadoInicial();
        estado.campeonato = { nome: nomeDuplicado(c.nome), config: { ...c.config }, jogadores: c.jogadores, sorteio: null };
        estado.aparencia = origem.aparencia;
        return criarEdicao(estado);
      });
    }

    // Modelo (nome, configuração, jogadores e aparência) de uma edição, em JSON.
    function exportarModelo(id) {
      buscar(id);
      return JSON.stringify({ ...Estado.modeloDoEstado(lerEdicao(id)), exportadoEm: agora().toISOString() }, null, 2);
    }

    // Edição nova (que passa a ser a ativa) a partir de um modelo. Arquivo inválido: lança Error e nada muda.
    function criarDeModelo(texto) {
      let obj;
      try {
        obj = JSON.parse(texto);
      } catch (_) {
        throw new Error("o arquivo não é um JSON válido.");
      }
      const modelo = Estado.validarModelo(obj);
      return alterar(() => criarEdicao({ ...Estado.estadoInicial(), campeonato: modelo.campeonato, aparencia: modelo.aparencia }));
    }

    function abrir(id) {
      alterar(() => {
        if (buscar(id).arquivado) throw new Error("desarquive o campeonato antes de abrir.");
        indice.ativo = id;
      });
    }

    // Arquivar apaga o histórico do desfazer da edição, para poupar espaço no navegador.
    function arquivar(id) {
      alterar(() => {
        buscar(id).arquivado = true;
        try {
          const obj = JSON.parse(ler(chaveDe(id)));
          if (obj && typeof obj === "object" && Array.isArray(obj.historico) && obj.historico.length) {
            obj.historico = [];
            gravar(chaveDe(id), JSON.stringify(obj));
          }
        } catch (_) {
          // dados inválidos: ficam como estão
        }
      });
    }

    function desarquivar(id) {
      alterar(() => { buscar(id).arquivado = false; });
    }

    // Sem desfazer e sem lixeira.
    function excluir(id) {
      alterar(() => {
        buscar(id);
        try { armazenamento.removeItem(chaveDe(id)); } catch (_) { /* já não existe */ }
        indice.campeonatos = indice.campeonatos.filter((c) => c.id !== id);
        resumos.delete(id);
      });
    }

    // Backup como nova edição (que passa a ser a ativa). O histórico do desfazer do arquivo fica
    // de fora; o registro do último backup vem junto. Arquivo inválido: lança Error e nada muda.
    function importarComoNovo(texto) {
      let obj;
      try {
        obj = JSON.parse(texto);
      } catch (_) {
        throw new Error("o arquivo não é um JSON válido.");
      }
      const importado = Estado.validarEstado(obj);
      return alterar(() => criarEdicao({ ...importado, historico: [] }));
    }

    // Espaço ocupado pelo app no armazenamento (o navegador guarda texto em UTF-16: 2 bytes por caractere).
    function espacoUsado() {
      let bytes = 0;
      for (const k of chavesGuardadas()) {
        if (!k.startsWith(PREFIXO_APP)) continue;
        bytes += (k.length + (ler(k) || "").length) * 2;
      }
      return { bytes, limite: LIMITE_BYTES };
    }

    carregar();

    return {
      ativo: () => indice.ativo,
      chaveAtiva: () => chaveDe(indice.ativo),
      listar,
      novo,
      duplicar,
      abrir,
      arquivar,
      desarquivar,
      excluir,
      importarComoNovo,
      exportarModelo,
      criarDeModelo,
      espacoUsado,
      recarregar: carregar,
      status: () => ({ ...status }),
    };
  }

  globalThis.Campeonatos = { criar, CHAVE_INDICE, PREFIXO, chaveDe };
})();
