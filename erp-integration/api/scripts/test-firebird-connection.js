require("dotenv").config();
const { query } = require("../src/db");

/*
 * Valida a instalação ANTES de subir a API inteira, e — mais importante —
 * imprime as COLUNAS REAIS da tabela de clientes.
 *
 * O mapeamento em src/routes/clientes.js foi escrito sem acesso ao ERP. Este
 * script é o que fecha essa lacuna: rode, compare a saída com o objeto COLUNAS
 * e ajuste o que divergir.
 */

const tabela = process.env.ERP_TABELA_CLIENTES || "ERP_CLIENTE";

async function main() {
  console.log("─".repeat(64));
  console.log("Teste de conexão com o Firebird");
  console.log("─".repeat(64));
  console.log(`Host     : ${process.env.FIREBIRD_HOST}:${process.env.FIREBIRD_PORT}`);
  console.log(`Banco    : ${process.env.FIREBIRD_DATABASE}`);
  console.log(`Usuário  : ${process.env.FIREBIRD_USER}`);
  console.log(`Tabela   : ${tabela}`);
  console.log("");

  // 1. Conectividade
  const versao = await query(
    "SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') AS versao FROM RDB$DATABASE",
  );
  console.log(`✓ Conectado. Versão do engine: ${versao[0]?.versao ?? "desconhecida"}`);

  // 2. Primeiras tabelas do banco (só as de usuário, não as do sistema)
  const tabelas = await query(`
    SELECT FIRST 5 TRIM(rdb$relation_name) AS nome
    FROM rdb$relations
    WHERE rdb$system_flag = 0 AND rdb$view_blr IS NULL
    ORDER BY rdb$relation_name
  `);
  console.log(`\n✓ Primeiras tabelas encontradas (${tabelas.length}):`);
  tabelas.forEach((t) => console.log(`   • ${t.nome}`));

  // 3. A tabela de clientes existe?
  const existe = await query(
    `SELECT COUNT(*) AS n FROM rdb$relations WHERE TRIM(rdb$relation_name) = ?`,
    [tabela],
  );
  if (Number(existe[0]?.n ?? 0) === 0) {
    console.log(`\n✗ A tabela/view "${tabela}" NÃO existe neste banco.`);
    console.log("   Ajuste ERP_TABELA_CLIENTES no .env para o nome correto.");
    console.log("   (as tabelas acima são um começo para descobrir qual é)");
    process.exit(1);
  }

  // 4. Colunas reais — o dado mais importante deste script
  const colunas = await query(
    `SELECT TRIM(rf.rdb$field_name) AS coluna, t.rdb$type_name AS tipo
     FROM rdb$relation_fields rf
     JOIN rdb$fields f ON f.rdb$field_name = rf.rdb$field_source
     JOIN rdb$types t ON t.rdb$type = f.rdb$field_type AND t.rdb$field_name = 'RDB$FIELD_TYPE'
     WHERE TRIM(rf.rdb$relation_name) = ?
     ORDER BY rf.rdb$field_position`,
    [tabela],
  );
  console.log(`\n✓ Colunas de ${tabela} (${colunas.length}):`);
  colunas.forEach((c) => console.log(`   • ${c.coluna.padEnd(28)} ${String(c.tipo || "").trim()}`));

  // 5. Total de registros
  const total = await query(`SELECT COUNT(*) AS total FROM ${tabela}`);
  console.log(`\n✓ Registros em ${tabela}: ${total[0]?.total ?? 0}`);

  console.log("\n" + "─".repeat(64));
  console.log("PRÓXIMO PASSO: compare as colunas acima com o objeto COLUNAS em");
  console.log("src/routes/clientes.js e ajuste o que estiver diferente.");
  console.log("─".repeat(64));
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ FALHOU: ${err.message}\n`);
  console.error("Verifique, nesta ordem:");
  console.error("  1. O serviço do Firebird está rodando? (services.msc → Firebird Server)");
  console.error("  2. O caminho em FIREBIRD_DATABASE existe e está acessível?");
  console.error("  3. Usuário e senha estão corretos?");
  console.error("  4. A porta 3050 está liberada no firewall local?");
  process.exit(1);
});
