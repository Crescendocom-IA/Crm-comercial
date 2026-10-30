const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const logger = require("../logger");
const { ENTIDADES, paraEntidade } = require("../mapping");

/*
 * Sync ERP → CRM, empurrado pelo agente (sem n8n nem túnel no caminho).
 *
 * Ordem: vendedores, grupos, produtos, clientes, pedidos, itens. O CRM liga as
 * entidades por codigo_erp e aceita qualquer ordem, mas mandar as referências
 * antes deixa as telas consistentes durante uma carga longa.
 *
 * Incremental: cada entidade guarda em data/ultimo-sync.json o instante em que
 * o último sync DELA começou; o próximo pede só DATA_ULT_ALTERACAO >= esse
 * instante menos uma margem (relógio do servidor vs. gravação no ERP). Um
 * sync com lote falho não avança a marca — o próximo reenvia o período.
 */

const ESTADO = process.env.SYNC_STATE_FILE || path.join(__dirname, "..", "..", "data", "ultimo-sync.json");
const MARGEM_MS = 10 * 60 * 1000;
// Sem tempo limite, uma resposta que nunca chega pendura o sync para sempre, e
// num serviço ninguém vê (aconteceu na carga inicial).
const CRM_TIMEOUT_MS = 120_000;
const CRM_TENTATIVAS = 3;
const CRM_ESPERA_MS = Number(process.env.SYNC_RETRY_WAIT_MS) || 5000;

function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  } catch {
    return {};
  }
}

function gravarEstado(estado) {
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 2));
}

async function enviarLote(entities) {
  const url = process.env.CRM_SYNC_URL;
  const token = process.env.CRM_TOKEN;
  if (!url || !token || token.startsWith("cole_o_token")) {
    throw new Error("CRM_SYNC_URL ou CRM_TOKEN não configurados no .env");
  }

  let ultimoErro;
  for (let tentativa = 1; tentativa <= CRM_TENTATIVAS; tentativa++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ERP-Token": token },
        body: JSON.stringify({ entities }),
        signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
      });
      const texto = await resp.text();
      if (resp.ok) {
        try {
          return JSON.parse(texto);
        } catch {
          throw new Error(`CRM devolveu resposta não-JSON: ${texto.slice(0, 200)}`);
        }
      }
      ultimoErro = new Error(`CRM respondeu ${resp.status}: ${texto.slice(0, 300)}`);
      // 4xx é configuração (token errado etc.): repetir não resolve.
      if (resp.status < 500) throw Object.assign(ultimoErro, { definitivo: true });
    } catch (err) {
      if (err.definitivo) throw err;
      ultimoErro = err;
    }
    if (tentativa < CRM_TENTATIVAS) {
      logger.warn(`Envio ao CRM falhou (tentativa ${tentativa}): ${ultimoErro.message}`);
      await new Promise((r) => setTimeout(r, CRM_ESPERA_MS * tentativa));
    }
  }
  throw ultimoErro;
}

/**
 * Envia linhas já lidas do ERP. Usado pelo sync e por cargas a partir de
 * arquivo (mesmo mapeamento, mesmo destino).
 */
async function enviarLinhas(entidade, rows, resumo) {
  const entities = rows.map((r) => paraEntidade(entidade, r)).filter(Boolean);
  if (entities.length === 0) return;
  const r = await enviarLote(entities);
  resumo.enviados += entities.length;
  resumo.inserted += r.inserted ?? 0;
  resumo.updated += r.updated ?? 0;
  resumo.upserted += r.upserted ?? 0;
  resumo.errors += r.errors ?? 0;
}

/** Valor da chave na linha (o node-firebird devolve colunas em minúsculas). */
const valorChave = (row, chave) => row[chave.toLowerCase()] ?? row[chave];

/**
 * Sincroniza uma entidade.
 * @param {object} entidade item de ENTIDADES
 * @param {Date|null} since só linhas com DATA_ULT_ALTERACAO >= since (null = tudo)
 */
async function syncEntidade(entidade, since = null) {
  const batchSize = Math.min(1000, Number(process.env.SYNC_BATCH_SIZE) || 500);
  const inicio = Date.now();
  const filtro = since ? "DATA_ULT_ALTERACAO >= ?" : null;
  const params = since ? [since] : [];

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM ${entidade.tabela}${filtro ? ` WHERE ${filtro}` : ""}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  logger.info(`[${entidade.nome}] ${total} linha(s)${since ? ` desde ${since.toISOString()}` : " (completo)"}`);

  const resumo = { entidade: entidade.nome, total, enviados: 0, inserted: 0, updated: 0, upserted: 0, errors: 0, lotes_com_falha: [] };
  const colunas = entidade.colunas.join(", ");

  /*
   * Paginação pela chave (WHERE chave > última), não FIRST/SKIP: SKIP faz o
   * Firebird percorrer tudo o que pula, e os últimos lotes dos 272 mil itens
   * passariam do tempo limite da query.
   */
  let ultima = null;
  for (;;) {
    const where = [filtro, ultima !== null ? `${entidade.chave} > ?` : null].filter(Boolean);
    let rows;
    try {
      rows = await query(
        `SELECT FIRST ${Number(batchSize)} ${colunas} FROM ${entidade.tabela}` +
        `${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${entidade.chave}`,
        ultima !== null ? [...params, ultima] : params,
      );
    } catch (err) {
      // Sem conseguir ler não há como avançar: encerra e o próximo sync recomeça.
      resumo.lotes_com_falha.push({ apos: ultima, erro: err.message });
      logger.error(`[${entidade.nome}] leitura após chave ${ultima} falhou: ${err.message}`);
      break;
    }
    if (rows.length === 0) break;

    try {
      await enviarLinhas(entidade, rows, resumo);
    } catch (err) {
      // Um lote que falha não aborta o sync: segue, e a marca de sync não avança.
      resumo.lotes_com_falha.push({ apos: ultima, erro: err.message });
      logger.error(`[${entidade.nome}] envio após chave ${ultima} falhou: ${err.message}`);
    }
    ultima = valorChave(rows[rows.length - 1], entidade.chave);
    if (rows.length < batchSize) break;
  }

  resumo.duracao_ms = Date.now() - inicio;
  logger.info(
    `[${entidade.nome}] ${resumo.enviados}/${total} enviados em ${resumo.duracao_ms}ms ` +
    `(${resumo.errors} erros, ${resumo.lotes_com_falha.length} lote(s) com falha)`,
  );
  return resumo;
}

let rodando = false;

/**
 * Sincroniza todas as entidades. `completo` ignora as marcas e envia tudo.
 * Não roda duas vezes ao mesmo tempo (o cron pode disparar com um sync longo
 * ainda em andamento).
 */
async function syncTudo({ completo = false, so = null } = {}) {
  if (rodando) {
    logger.warn("Sync já em andamento — disparo ignorado");
    return { ignorado: true };
  }
  rodando = true;
  try {
    const estado = lerEstado();
    const resultados = [];
    for (const entidade of ENTIDADES) {
      if (so && !so.includes(entidade.nome)) continue;
      const comeco = new Date();
      const marca = !completo && estado[entidade.nome] ? new Date(new Date(estado[entidade.nome]) - MARGEM_MS) : null;
      const r = await syncEntidade(entidade, marca);
      resultados.push(r);
      if (r.lotes_com_falha.length === 0) {
        estado[entidade.nome] = comeco.toISOString();
        gravarEstado(estado);
      }
    }
    return { resultados };
  } finally {
    rodando = false;
  }
}

/** Compatibilidade com POST /sync/clientes. */
async function syncClientesToCRM(since = null) {
  const entidade = ENTIDADES.find((e) => e.nome === "clientes");
  const d = since ? new Date(since) : null;
  if (d && Number.isNaN(d.getTime())) throw new Error(`since inválido: ${since}`);
  return syncEntidade(entidade, d);
}

module.exports = { syncTudo, syncEntidade, syncClientesToCRM, enviarLinhas, enviarLote };
