const express = require("express");
const router = express.Router();

/*
 * Reservado para a Fase 3. As rotas existem para o contrato ficar estável (o
 * n8n e o CRM já podem apontar para cá), mas respondem 501 em vez de fingir
 * que funcionam — endpoint que devolve lista vazia é pior que endpoint que
 * assume não estar pronto.
 */
router.get("/", (_req, res) =>
  res.status(501).json({ error: "not_implemented", fase: 3, recurso: "produtos" }));

router.get("/count", (_req, res) =>
  res.status(501).json({ error: "not_implemented", fase: 3, recurso: "produtos" }));

module.exports = router;
