const path = require("path");
const { Service } = require("node-windows");

/*
 * Registra a API como serviço do Windows para subir sozinha no boot e reiniciar
 * se cair — sem isso, um reboot do servidor deixaria o sync parado até alguém
 * perceber.
 *
 * Rodar como Administrador: criar serviço exige privilégio elevado.
 */
const svc = new Service({
  name: "FlowCRM ERP API",
  description: "API intermediária que lê o Firebird do ERP e sincroniza com o FlowCRM",
  script: path.join(__dirname, "..", "src", "index.js"),
  nodeOptions: [],
  // Reinício com espera crescente: evita loop de reinício apertado quando o
  // Firebird ainda não subiu depois de um boot.
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on("install", () => {
  console.log("✓ Serviço instalado. Iniciando...");
  svc.start();
});
svc.on("start", () => console.log('✓ Serviço "FlowCRM ERP API" em execução.'));
svc.on("alreadyinstalled", () => console.log("! Serviço já estava instalado."));
svc.on("error", (e) => console.error(`✗ Erro: ${e}`));

console.log("Instalando serviço do Windows (requer Administrador)...");
svc.install();
