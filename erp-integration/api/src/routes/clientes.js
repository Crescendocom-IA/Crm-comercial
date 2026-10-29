const express = require("express");
const { query } = require("../db");
const logger = require("../logger");
const { ENTIDADES, paraEntidade } = require("../mapping");

const router = express.Router();

/*
 * Consulta de diagnóstico: mostra os clientes do ERP já no formato que o CRM
 * recebe. O sync não passa por aqui — o agente envia direto ao CRM
 * (services/sync.js). Colunas e conversão vêm de src/mapping.js.
 */
const entidade = ENTIDADES.find((e) => e.nome === "clientes");

/** GET /clientes/count — total, para planejar os lotes. */
router.get("/count", async (_req, res) => {
  try {
    const rows = await query(`SELECT COUNT(*) AS total FROM ${entidade.tabela}`);
    res.json({ total: Number(rows[0]?.total ?? 0) });
  } catch (err) {
    logger.error(`GET /clientes/count: ${err.message}`);
    res.status(500).json({ error: "erp_query_failed", message: err.message });
  }
});

/** GET /clientes?page=1&limit=500&since=2026-07-01T00:00:00Z */
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  const offset = (page - 1) * limit;
  const since = req.query.since;

  try {
    const params = [];
    let where = "";
    if (since) {
      const d = new Date(since);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "invalid_since", message: "since deve ser uma data ISO" });
      }
      where = "WHERE DATA_ULT_ALTERACAO >= ?";
      params.push(d);
    }

    // Firebird 2.5: FIRST/SKIP em vez de LIMIT/OFFSET.
    const [rows, countRows] = await Promise.all([
      query(
        `SELECT FIRST ${limit} SKIP ${offset} ${entidade.colunas.join(", ")} FROM ${entidade.tabela} ${where} ORDER BY ${entidade.chave}`,
        params,
      ),
      query(`SELECT COUNT(*) AS total FROM ${entidade.tabela} ${where}`, params),
    ]);

    res.json({
      page,
      limit,
      total: Number(countRows[0]?.total ?? 0),
      clientes: rows.map((r) => paraEntidade(entidade, r)).filter(Boolean),
    });
  } catch (err) {
    logger.error(`GET /clientes: ${err.message}`);
    res.status(500).json({ error: "erp_query_failed", message: err.message });
  }
});

module.exports = router;
