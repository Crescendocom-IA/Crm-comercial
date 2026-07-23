require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const logger = require("./logger");
const db = require("./db");
const auth = require("./middleware/auth");
const { syncClientesToCRM } = require("./services/sync");

const app = express();
app.use(express.json({ limit: "2mb" }));

/*
 * CORS restrito. Esta API é server-to-server (n8n / Cloudflare Tunnel), então o
 * padrão é NÃO liberar origem nenhuma. CORS_ORIGINS existe só para o caso de
 * alguém precisar chamar de um painel próprio.
 */
const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origem = req.get("Origin");
  if (origem && origensPermitidas.includes(origem)) {
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Token");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Log de toda requisição, com duração e status.
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

/*
 * /health SEM auth: é o que o Cloudflare Tunnel usa para saber se o serviço
 * está de pé. Não expõe nada além de "ligado" e se o Firebird responde.
 */
app.get("/health", async (_req, res) => {
  try {
    await db.ping();
    res.json({ status: "ok", firebird: "conectado", uptime_s: Math.round(process.uptime()) });
  } catch (err) {
    // 503, não 500: o serviço está vivo, quem não está é o banco.
    res.status(503).json({ status: "degraded", firebird: "erro", message: err.message });
  }
});

// Daqui para baixo, tudo exige X-API-Token.
app.use(auth);

app.use("/clientes", require("./routes/clientes"));
app.use("/produtos", require("./routes/produtos"));
app.use("/pedidos", require("./routes/pedidos"));

/*
 * Dispara o sync manualmente. `since` no corpo torna o sync incremental;
 * sem ele, varre a base inteira.
 */
app.post("/sync/clientes", async (req, res) => {
  try {
    const resumo = await syncClientesToCRM(req.body?.since ?? null);
    res.json(resumo);
  } catch (err) {
    logger.error(`POST /sync/clientes: ${err.message}`);
    res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

// Handler de erro final — sem ele, uma exceção não tratada derruba o processo.
app.use((err, _req, res, _next) => {
  logger.error(`Erro não tratado: ${err.stack || err.message}`);
  res.status(500).json({ error: "internal_error" });
});

const port = Number(process.env.API_PORT || 3333);
app.listen(port, "127.0.0.1", () => {
  /*
   * Escuta só em 127.0.0.1 de propósito: quem expõe para fora é o Cloudflare
   * Tunnel. Assim a porta não fica aberta na rede do servidor mesmo que o
   * firewall do Windows esteja permissivo.
   */
  logger.info(`API do ERP ouvindo em http://127.0.0.1:${port} (apenas local)`);
});

// Sync agendado, se configurado.
const expressao = process.env.SYNC_CRON;
if (expressao) {
  if (!cron.validate(expressao)) {
    logger.error(`SYNC_CRON inválido: "${expressao}" — agendamento desligado`);
  } else {
    cron.schedule(expressao, async () => {
      logger.info(`Sync agendado disparado (${expressao})`);
      try {
        await syncClientesToCRM(null);
      } catch (err) {
        logger.error(`Sync agendado falhou: ${err.message}`);
      }
    });
    logger.info(`Sync agendado ativo: ${expressao}`);
  }
}

// Um erro solto não pode derrubar um serviço do Windows em silêncio.
process.on("unhandledRejection", (r) => logger.error(`unhandledRejection: ${r}`));
process.on("uncaughtException", (e) => logger.error(`uncaughtException: ${e.stack || e.message}`));
