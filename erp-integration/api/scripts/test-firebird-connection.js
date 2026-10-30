require("dotenv").config();
const { query } = require("../src/db");
const { ENTIDADES, paraEntidade } = require("../src/mapping");

/*
 * Valida a instalação ANTES de ligar o sync: conexão, e se cada tabela e coluna
 * que src/mapping.js usa existe neste banco. O mapeamento foi conferido contra
 * uma cópia do ERP; este script confirma que o servidor real é igual.
 *
 * Só lê. Não envia nada ao CRM.
 */

async function colunasDe(tabela) {
  const rows = await query(
    "SELECT TRIM(rdb$field_name) AS coluna FROM rdb$relation_fields WHERE TRIM(rdb$relation_name) = ?",
    [tabela],
  );
  return new Set(rows.map((r) => String(r.coluna).trim().toUpperCase()));
}

/** A coluna tem índice? Sem ele, o sync fica lento nas tabelas grandes. */
async function temIndice(tabela, coluna) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM rdb$indices i
     JOIN rdb$index_segments s ON s.rdb$index_name = i.rdb$index_name
     WHERE TRIM(i.rdb$relation_name) = ? AND TRIM(s.rdb$field_name) = ? AND s.rdb$field_position = 0`,
    [tabela, coluna],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  console.log("─".repeat(64));
  console.log("Teste do agente: conexão e tabelas do ERP");
  console.log("─".repeat(64));
  console.log(`Host   : ${process.env.FIREBIRD_HOST}:${process.env.FIREBIRD_PORT}`);
  console.log(`Banco  : ${process.env.FIREBIRD_DATABASE}`);
  console.log(`Usuário: ${process.env.FIREBIRD_USER}\n`);

  const versao = await query("SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') AS versao FROM RDB$DATABASE");
  console.log(`✓ Conectado. Firebird ${versao[0]?.versao ?? "versão desconhecida"}\n`);

  let problemas = 0;
  const avisos = [];

  for (const e of ENTIDADES) {
    const reais = await colunasDe(e.tabela);
    if (reais.size === 0) {
      console.log(`✗ ${e.tabela}: tabela NÃO encontrada`);
      problemas++;
      continue;
    }
    const faltando = e.colunas.filter((c) => !reais.has(c));
    if (faltando.length) {
      console.log(`✗ ${e.tabela}: faltam as colunas ${faltando.join(", ")}`);
      problemas++;
      continue;
    }
    const total = await query(`SELECT COUNT(*) AS total FROM ${e.tabela}`);
    console.log(`✓ ${e.tabela.padEnd(18)} ${String(total[0]?.total ?? 0).padStart(8)} registros, ${e.colunas.length} colunas ok`);

    if (!(await temIndice(e.tabela, e.chave))) avisos.push(`${e.tabela}.${e.chave} sem índice`);
    if (!(await temIndice(e.tabela, "DATA_ULT_ALTERACAO"))) avisos.push(`${e.tabela}.DATA_ULT_ALTERACAO sem índice`);
  }

  if (problemas) {
    console.log(`\n✗ ${problemas} problema(s). Este ERP é diferente do mapeado em src/mapping.js.`);
    console.log("  Não ligue o sync; envie esta saída para quem cuida da integração.");
    process.exit(1);
  }

  // Acentos: se aparecerem errados aqui, ajuste FIREBIRD_ENCODING no .env.
  const clientes = ENTIDADES.find((e) => e.nome === "clientes");
  const amostra = await query(
    `SELECT FIRST 3 ${clientes.colunas.join(", ")} FROM ${clientes.tabela}
     WHERE CLI_RAZAOSOCIAL LIKE '%Ã%' OR CLI_RAZAOSOCIAL LIKE '%Ç%' ORDER BY ${clientes.chave}`,
  );
  console.log("\nAmostra (confira se os ACENTOS estão certos):");
  amostra.forEach((r) => {
    const ent = paraEntidade(clientes, r);
    console.log(`   • ${ent?.data.name} — ${ent?.data.cidade ?? ""}`);
  });
  if (amostra.length === 0) console.log("   (nenhum nome com Ã ou Ç encontrado para conferir)");

  if (avisos.length) {
    console.log("\n! Sem índice (funciona, mas o sync fica mais lento nas tabelas grandes):");
    avisos.forEach((a) => console.log(`   • ${a}`));
  }

  console.log("\n" + "─".repeat(64));
  console.log("Tudo certo. Próximo passo: npm run sync -- --so=vendedores");
  console.log("─".repeat(64));
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ FALHOU: ${err.message}\n`);
  console.error("Verifique, nesta ordem:");
  console.error("  1. O serviço do Firebird está rodando? (services.msc → Firebird Server)");
  console.error("  2. O caminho em FIREBIRD_DATABASE existe neste servidor?");
  console.error("  3. Usuário e senha estão corretos?");
  process.exit(1);
});
