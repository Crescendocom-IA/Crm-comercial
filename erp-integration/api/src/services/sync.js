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

const ESTADO = path.join(__dirname, "..", "..", "data", "ultimo-sync.json");
const MARGEM_MS = 10 * 60 * 1000;

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

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ERP-Token": token },
    body: JSON.stringify({ entities }),
  });

  const texto = await resp.text();
  if (!resp.ok) throw new Error(`CRM respondeu ${resp.status}: ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`CRM devolveu resposta não-JSON: ${texto.slice(0, 200)}`);
  }
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

/**
 * O Firebird 2.5 NÃO tem LIMIT/OFFSET — é `FIRST n SKIP m`, e a ordem das
 * palavras importa (FIRST antes de SKIP).
 */
const paginacao = (limit, offset) => `FIRST ${Number(limit)} SKIP ${Number(offset)}`;

/**
 * Sincroniza uma entidade.
 * @param {object} entidade item de ENTIDADES
 * @param {Date|null} since só linhas com DATA_ULT_ALTERACAO >= since (null = tudo)
 */
async function syncEntidade(entidade, since = null) {
  const batchSize = Math.min(1000, Number(process.env.SYNC_BATCH_SIZE) || 500);
  const inicio = Date.now();
  const where = since ? "WHERE DATA_ULT_ALTERACAO >= ?" : "";
  const params = since ? [since] : [];

  const countRows = await query(`SELECT COUNT(*) AS total FROM ${entidade.tabela} ${where}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  logger.info(`[${entidade.nome}] ${total} linha(s)${since ? ` desde ${since.toISOString()}` : " (completo)"}`);

  const resumo = { entidade: entidade.nome, total, enviados: 0, inserted: 0, updated: 0, upserted: 0, errors: 0, lotes_com_falha: [] };
  const colunas = entidade.colunas.join(", ");

  for (let offset = 0; offset < total; offset += batchSize) {
    try {
      const rows = await query(
        `SELECT ${paginacao(batchSize, offset)} ${colunas} FROM ${entidade.tabela} ${where} ORDER BY ${entidade.chave}`,
        params,
      );
      if (rows.length === 0) break;
      await enviarLinhas(entidade, rows, resumo);
    } catch (err) {
      // Um lote que falha não aborta o sync: segue e reporta para reprocessar.
      resumo.lotes_com_falha.push({ offset, erro: err.message });
      logger.error(`[${entidade.nome}] lote offset ${offset} falhou: ${err.message}`);
    }
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
async function syncTudo({ completo = false } = {}) {
  if (rodando) {
    logger.warn("Sync já em andamento — disparo ignorado");
    return { ignorado: true };
  }
  rodando = true;
  try {
    const estado = lerEstado();
    const resultados = [];
    for (const entidade of ENTIDADES) {
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
