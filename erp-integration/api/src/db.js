const Firebird = require("node-firebird");
const logger = require("./logger");

/*
 * Wrapper do node-firebird.
 *
 * Três cuidados que o Firebird 2.5 exige e que a biblioteca não dá de graça:
 *
 * 1. POOL PEQUENO. O Firebird 2.5 (sobretudo em Classic/SuperClassic) gasta um
 *    processo por conexão. Cinco é folgado para um sync em lote e evita brigar
 *    por recurso com o próprio ERP, que é quem importa nesse servidor.
 *
 * 2. TIMEOUT. A biblioteca não tem timeout de query: se o servidor engasgar, a
 *    Promise fica pendurada para sempre e o serviço trava sem erro. O
 *    Promise.race abaixo garante que toda query termina, nem que seja em falha.
 *
 * 3. RECONEXÃO. O Firebird derruba conexão ociosa. Quando o pool devolve erro
 *    de conexão, recriamos o pool e tentamos UMA vez — mais que isso mascararia
 *    um banco fora do ar como lentidão.
 */

const MAX_POOL = 5;
const QUERY_TIMEOUT_MS = 30_000;

function buildOptions() {
  return {
    host: process.env.FIREBIRD_HOST || "localhost",
    port: Number(process.env.FIREBIRD_PORT || 3050),
    database: process.env.FIREBIRD_DATABASE,
    user: process.env.FIREBIRD_USER || "SYSDBA",
    password: process.env.FIREBIRD_PASSWORD,
    // O Firebird devolve nomes de coluna em MAIÚSCULAS. Sem isto, todo acesso
    // no código vira row.CODIGO em vez de row.codigo.
    lowercase_keys: true,
    pageSize: 4096,
  };
}

let pool = null;

function getPool() {
  if (!pool) {
    const opts = buildOptions();
    if (!opts.database) throw new Error("FIREBIRD_DATABASE não configurado no .env");
    pool = Firebird.pool(MAX_POOL, opts);
    logger.info(`Pool Firebird criado (max ${MAX_POOL}) -> ${opts.host}:${opts.port}`);
  }
  return pool;
}

function resetPool() {
  try {
    if (pool && typeof pool.destroy === "function") pool.destroy();
  } catch (err) {
    logger.warn(`Falha ao destruir pool: ${err.message}`);
  }
  pool = null;
}

/** Uma tentativa de query, sem retry. */
function attempt(sql, params) {
  return new Promise((resolve, reject) => {
    getPool().get((err, db) => {
      if (err) return reject(err);
      db.query(sql, params, (qErr, result) => {
        // detach() devolve a conexão ao pool — sem isto o pool esgota em 5
        // queries e a API congela.
        try { db.detach(); } catch { /* conexão já caiu; nada a fazer */ }
        if (qErr) return reject(qErr);
        resolve(result || []);
      });
    });
  });
}

function isConnectionError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("shutdown") ||
    msg.includes("network")
  );
}

/**
 * Executa uma query com timeout e uma tentativa de reconexão.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array<object>>}
 */
async function query(sql, params = []) {
  const withTimeout = (p) =>
    Promise.race([
      p,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Query excedeu ${QUERY_TIMEOUT_MS}ms e foi abortada`)),
          QUERY_TIMEOUT_MS,
        ),
      ),
    ]);

  try {
    return await withTimeout(attempt(sql, params));
  } catch (err) {
    if (!isConnectionError(err)) {
      logger.error(`Erro de query: ${err.message} | SQL: ${sql.slice(0, 200)}`);
      throw err;
    }
    logger.warn(`Conexão caiu (${err.message}); recriando pool e tentando de novo`);
    resetPool();
    try {
      return await withTimeout(attempt(sql, params));
    } catch (err2) {
      logger.error(`Falha após reconexão: ${err2.message}`);
      throw err2;
    }
  }
}

/** Teste rápido de conectividade — usado por /health e pelo script de teste. */
async function ping() {
  // RDB$DATABASE sempre existe e tem exatamente uma linha.
  await query("SELECT 1 AS ok FROM RDB$DATABASE");
  return true;
}

module.exports = { query, ping, resetPool, MAX_POOL, QUERY_TIMEOUT_MS };
