const crypto = require("crypto");
const logger = require("../logger");

/**
 * Valida o header X-API-Token contra API_TOKEN do .env.
 *
 * A comparação é em tempo constante (timingSafeEqual): comparar com === vaza,
 * pelo tempo de resposta, quantos caracteres iniciais estão certos — o que
 * permite descobrir o token byte a byte. Com um segredo estático exposto num
 * túnel público, isso importa.
 */
module.exports = function auth(req, res, next) {
  const expected = process.env.API_TOKEN;
  if (!expected || expected.startsWith("troque_por")) {
    logger.error("API_TOKEN não configurado — recusando todas as requisições");
    return res.status(500).json({ error: "server_misconfigured" });
  }

  const got = req.get("X-API-Token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    logger.warn(`401 em ${req.method} ${req.originalUrl} de ${req.ip}`);
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
};
