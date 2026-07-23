const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");

const LOG_DIR = path.join(__dirname, "..", "logs");

/*
 * Rotação diária com retenção de 14 dias. Sem isso um serviço rodando por meses
 * num servidor Windows enche o disco em silêncio — e disco cheio derruba o
 * Firebird junto, o que transformaria um problema de log num problema de ERP.
 */
const rotate = new winston.transports.DailyRotateFile({
  dirname: LOG_DIR,
  filename: "erp-api-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  zippedArchive: true,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${timestamp} [${level.toUpperCase()}] ${stack || message}${extra}`;
    }),
  ),
  transports: [
    rotate,
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

module.exports = logger;
