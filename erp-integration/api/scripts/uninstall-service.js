const path = require("path");
const { Service } = require("node-windows");

/*
 * Remove o serviço do Windows. Precisa dos MESMOS name e script usados na
 * instalação — é assim que o node-windows identifica qual serviço remover.
 *
 * Rodar como Administrador.
 */
const svc = new Service({
  name: "FlowCRM ERP API",
  description: "API intermediária que lê o Firebird do ERP e sincroniza com o FlowCRM",
  script: path.join(__dirname, "..", "src", "index.js"),
});

svc.on("uninstall", () => {
  console.log("✓ Serviço removido.");
  console.log(`  Ainda instalado? ${svc.exists ? "sim" : "não"}`);
});
svc.on("alreadyuninstalled", () => console.log("! O serviço não estava instalado."));
svc.on("error", (e) => console.error(`✗ Erro: ${e}`));

console.log("Removendo serviço do Windows (requer Administrador)...");
svc.uninstall();
