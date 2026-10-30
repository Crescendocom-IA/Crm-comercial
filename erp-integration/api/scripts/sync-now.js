require("dotenv").config();
const { syncTudo } = require("../src/services/sync");

/*
 * Roda um sync agora, no terminal, e mostra o resultado.
 *
 *   npm run sync                         só o que mudou desde o último sync
 *   npm run sync -- --so=vendedores      só uma entidade (separe por vírgula)
 *   npm run sync -- --completo           reenvia tudo
 */
const args = process.argv.slice(2);
const so = args.find((a) => a.startsWith("--so="))?.slice(5).split(",") ?? null;
const completo = args.includes("--completo");

syncTudo({ completo, so })
  .then(({ resultados = [] }) => {
    console.log("");
    let falhou = false;
    for (const r of resultados) {
      const ok = r.errors === 0 && r.lotes_com_falha.length === 0;
      falhou = falhou || !ok;
      console.log(`${ok ? "✓" : "✗"} ${r.entidade.padEnd(12)} ${r.enviados}/${r.total} enviados, ${r.errors} erro(s), ${r.lotes_com_falha.length} lote(s) com falha`);
      r.lotes_com_falha.slice(0, 3).forEach((l) => console.log(`    ${l.erro}`));
    }
    process.exit(falhou ? 1 : 0);
  })
  .catch((err) => {
    console.error(`✗ FALHOU: ${err.message}`);
    process.exit(1);
  });
