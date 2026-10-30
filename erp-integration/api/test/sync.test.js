const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

/*
 * Testa o sync sem Firebird nem rede: db, logger e fetch são falsos. O banco
 * falso interpreta só o que o sync usa (COUNT, FIRST n, chave > ?, data >= ?).
 */

const estado = path.join(os.tmpdir(), `flowcrm-sync-teste-${process.pid}.json`);
process.env.SYNC_STATE_FILE = estado;
process.env.SYNC_RETRY_WAIT_MS = "1";
process.env.SYNC_BATCH_SIZE = "2";
process.env.CRM_SYNC_URL = "http://crm.invalid/erp-sync";
process.env.CRM_TOKEN = "token-de-teste";

let tabelas = {};
let consultas = [];
let falharLeitura = false;

const dbFalso = {
  query: async (sql, params = []) => {
    consultas.push(sql);
    const tabela = sql.match(/FROM (\w+)/)[1];
    if (falharLeitura && !sql.includes("COUNT")) throw new Error("firebird caiu");
    let linhas = tabelas[tabela] ?? [];
    if (sql.includes("COUNT(*)")) return [{ total: linhas.length }];
    const chave = sql.match(/ORDER BY (\w+)/)[1].toLowerCase();
    if (sql.includes(`${chave.toUpperCase()} > ?`)) {
      const ultima = params[params.length - 1];
      linhas = linhas.filter((l) => l[chave] > ultima);
    }
    const n = Number(sql.match(/FIRST (\d+)/)[1]);
    return linhas.slice(0, n);
  },
};
const loggerFalso = { info() {}, warn() {}, error() {} };

// Substitui ../db e ../logger antes de carregar o sync (evita node-firebird/winston).
const resolverOriginal = Module._load;
Module._load = function (request, ...rest) {
  if (request === "../db") return dbFalso;
  if (request === "../logger") return loggerFalso;
  return resolverOriginal.call(this, request, ...rest);
};
const { syncTudo, syncEntidade } = require("../src/services/sync");
const { ENTIDADES } = require("../src/mapping");

const vendedores = ENTIDADES.find((e) => e.nome === "vendedores");
const respostaOk = (entities) => new Response(JSON.stringify({ upserted: entities.length }), { status: 200 });

let enviados;
beforeEach(() => {
  tabelas = {};
  consultas = [];
  enviados = [];
  falharLeitura = false;
  fs.rmSync(estado, { force: true });
  global.fetch = async (_url, init) => {
    const { entities } = JSON.parse(init.body);
    enviados.push(...entities);
    return respostaOk(entities);
  };
});

const linhasVendedor = (n) => Array.from({ length: n }, (_, i) => ({ vend_id: i + 1, vend_descricao: `V${i + 1}` }));

test("envia todas as linhas paginando pela chave, sem SKIP", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(5);
  const r = await syncEntidade(vendedores);
  assert.deepStrictEqual(enviados.map((e) => e.codigo_erp), ["1", "2", "3", "4", "5"]);
  assert.strictEqual(r.enviados, 5);
  assert.ok(consultas.every((sql) => !sql.includes("SKIP")));
});

test("total múltiplo do lote termina sem repetir linha", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(4);
  await syncEntidade(vendedores);
  assert.strictEqual(enviados.length, 4);
});

test("nunca lê a senha do vendedor", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  await syncEntidade(vendedores);
  assert.ok(consultas.every((sql) => !sql.toUpperCase().includes("SENHA")));
});

test("repete o envio quando o CRM falha com 500", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  let chamadas = 0;
  global.fetch = async (_url, init) => {
    chamadas++;
    if (chamadas < 3) return new Response("erro", { status: 500 });
    return respostaOk(JSON.parse(init.body).entities);
  };
  const r = await syncEntidade(vendedores);
  assert.strictEqual(chamadas, 3);
  assert.strictEqual(r.lotes_com_falha.length, 0);
});

test("resposta que não chega (rede/timeout) também é repetida", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  let chamadas = 0;
  global.fetch = async (_url, init) => {
    chamadas++;
    if (chamadas === 1) throw new DOMException("timeout", "TimeoutError");
    return respostaOk(JSON.parse(init.body).entities);
  };
  const r = await syncEntidade(vendedores);
  assert.strictEqual(chamadas, 2);
  assert.strictEqual(r.enviados, 1);
});

test("token errado (401) não repete e é reportado", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return new Response("nao", { status: 401 }); };
  const r = await syncEntidade(vendedores);
  assert.strictEqual(chamadas, 1);
  assert.match(r.lotes_com_falha[0].erro, /401/);
});

test("lote com falha não avança a marca; sucesso avança", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  global.fetch = async () => new Response("erro", { status: 500 });
  await syncTudo({ so: ["vendedores"] });
  assert.ok(!fs.existsSync(estado) || !JSON.parse(fs.readFileSync(estado, "utf8")).vendedores);

  global.fetch = async (_url, init) => respostaOk(JSON.parse(init.body).entities);
  await syncTudo({ so: ["vendedores"] });
  assert.ok(JSON.parse(fs.readFileSync(estado, "utf8")).vendedores);
});

test("segundo sync pede só o que mudou desde a marca", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  await syncTudo({ so: ["vendedores"] });
  consultas = [];
  await syncTudo({ so: ["vendedores"] });
  assert.ok(consultas.every((sql) => sql.includes("DATA_ULT_ALTERACAO >= ?")));
});

test("--completo ignora a marca", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  await syncTudo({ so: ["vendedores"] });
  consultas = [];
  await syncTudo({ so: ["vendedores"], completo: true });
  assert.ok(consultas.every((sql) => !sql.includes("DATA_ULT_ALTERACAO >= ?")));
});

test("erro de leitura encerra a entidade sem travar nem avançar a marca", async () => {
  tabelas.ERP_VENDEDOR = linhasVendedor(1);
  falharLeitura = true;
  const { resultados } = await syncTudo({ so: ["vendedores"] });
  assert.strictEqual(resultados[0].lotes_com_falha.length, 1);
  assert.ok(!fs.existsSync(estado));
});
