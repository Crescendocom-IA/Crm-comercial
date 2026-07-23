const express = require("express");
const { query } = require("../db");
const logger = require("../logger");

const router = express.Router();

/*
 * ⚠️ MAPEAMENTO DE COLUNAS — VERIFICAR ANTES DE USAR EM PRODUÇÃO
 *
 * Este arquivo foi escrito SEM acesso ao ERP real. Os nomes abaixo assumem a
 * camada ERP_CLIENTE descrita, mas não foram conferidos contra o banco.
 *
 * Antes de rodar o sync, execute:
 *     npm run test-firebird
 *
 * O script lista as colunas reais da tabela configurada em
 * ERP_TABELA_CLIENTES. Ajuste este objeto para bater com o que ele imprimir —
 * é o único lugar que precisa mudar.
 *
 * A chave é o nome no JSON de saída; o valor é a coluna no Firebird.
 */
const COLUNAS = {
  codigo_erp: "CODIGO",
  nome: "NOME",
  razao_social: "RAZAO_SOCIAL",
  cnpj_cpf: "CNPJ_CPF",
  email: "EMAIL",
  telefone: "TELEFONE",
  cidade: "CIDADE",
  estado: "ESTADO",
  ativo: "ATIVO",
  vendedor_codigo: "VENDEDOR",
  atualizado_em: "ATUALIZADO_EM",
};

const tabela = () => process.env.ERP_TABELA_CLIENTES || "ERP_CLIENTE";

/** Lista de colunas com alias, para o resultado já sair com o nome final. */
function selectList() {
  return Object.entries(COLUNAS)
    .map(([alias, col]) => `${col} AS ${alias}`)
    .join(", ");
}

/**
 * O Firebird 2.5 NÃO tem LIMIT/OFFSET — é `FIRST n SKIP m`, e a ordem das
 * palavras importa (FIRST antes de SKIP). Escrever LIMIT aqui daria erro de
 * sintaxe só na hora de rodar contra o banco real.
 */
function paginacao(limit, offset) {
  return `FIRST ${Number(limit)} SKIP ${Number(offset)}`;
}

/** Normaliza o que o Firebird devolve para o contrato do JSON. */
function normalizar(row) {
  const texto = (v) => {
    if (v === null || v === undefined) return null;
    // CHAR do Firebird vem preenchido com espaços à direita.
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  return {
    codigo_erp: texto(row.codigo_erp),
    nome: texto(row.nome),
    razao_social: texto(row.razao_social),
    cnpj_cpf: texto(row.cnpj_cpf)?.replace(/\D/g, "") ?? null,
    email: texto(row.email)?.toLowerCase() ?? null,
    telefone: texto(row.telefone)?.replace(/\D/g, "") ?? null,
    cidade: texto(row.cidade),
    estado: texto(row.estado)?.toUpperCase() ?? null,
    // ERPs brasileiros usam 'S'/'N', 1/0 ou boolean conforme a versão.
    ativo: normalizarBooleano(row.ativo),
    vendedor_codigo: texto(row.vendedor_codigo),
    atualizado_em: row.atualizado_em ? new Date(row.atualizado_em).toISOString() : null,
  };
}

function normalizarBooleano(v) {
  if (v === null || v === undefined) return true; // sem informação, assume ativo
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toUpperCase();
  return s === "S" || s === "1" || s === "T" || s === "SIM" || s === "TRUE";
}

/** GET /clientes/count — total, para planejar os lotes. */
router.get("/count", async (req, res) => {
  try {
    const rows = await query(`SELECT COUNT(*) AS total FROM ${tabela()}`);
    res.json({ total: Number(rows[0]?.total ?? 0) });
  } catch (err) {
    logger.error(`GET /clientes/count: ${err.message}`);
    res.status(500).json({ error: "erp_query_failed", message: err.message });
  }
});

/**
 * GET /clientes?page=1&limit=500&since=2026-07-01T00:00:00Z
 *
 * `since` filtra pela coluna de atualização — é o que torna o sync incremental
 * possível. Sem ela, todo sync varre os 13 mil registros.
 */
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  const offset = (page - 1) * limit;
  const since = req.query.since;

  try {
    const where = [];
    const params = [];
    if (since) {
      const d = new Date(since);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "invalid_since", message: "since deve ser uma data ISO" });
      }
      where.push(`${COLUNAS.atualizado_em} >= ?`);
      params.push(d);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, countRows] = await Promise.all([
      query(
        `SELECT ${paginacao(limit, offset)} ${selectList()} FROM ${tabela()} ${whereSql} ORDER BY ${COLUNAS.codigo_erp}`,
        params,
      ),
      query(`SELECT COUNT(*) AS total FROM ${tabela()} ${whereSql}`, params),
    ]);

    res.json({
      page,
      limit,
      total: Number(countRows[0]?.total ?? 0),
      clientes: rows.map(normalizar),
    });
  } catch (err) {
    logger.error(`GET /clientes: ${err.message}`);
    res.status(500).json({ error: "erp_query_failed", message: err.message });
  }
});

module.exports = router;
module.exports.COLUNAS = COLUNAS;
module.exports.normalizar = normalizar;
module.exports.tabela = tabela;
module.exports.paginacao = paginacao;
