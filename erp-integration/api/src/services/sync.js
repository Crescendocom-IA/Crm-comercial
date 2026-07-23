const { query } = require("../db");
const logger = require("../logger");
const { COLUNAS, normalizar, tabela, paginacao } = require("../routes/clientes");

/*
 * DECISÃO DE MAPEAMENTO: um "cliente" do ERP vira contato OU empresa.
 *
 * O CRM separa pessoas (contacts) de organizações (companies); o ERP tem uma
 * lista só. O critério aqui é o documento: 14 dígitos = CNPJ = empresa;
 * qualquer outra coisa = pessoa. Na falta de documento, cai para empresa se
 * houver razão social, senão contato.
 *
 * Isso é uma suposição sobre o negócio, não uma verdade técnica. Se a base for
 * majoritariamente PJ e você quiser tudo como empresa, troque classificar()
 * por () => "company" — é o único ponto que decide.
 */
function classificar(cliente) {
  const doc = (cliente.cnpj_cpf || "").replace(/\D/g, "");
  if (doc.length === 14) return "company";
  if (doc.length === 11) return "contact";
  return cliente.razao_social ? "company" : "contact";
}

/** Converte um cliente normalizado no formato que o erp-sync do CRM espera. */
function paraEntidadeCRM(cliente) {
  const type = classificar(cliente);
  return {
    type,
    codigo_erp: cliente.codigo_erp,
    data: {
      // Empresa usa a razão social quando existe; pessoa usa o nome.
      name: type === "company"
        ? (cliente.razao_social || cliente.nome)
        : (cliente.nome || cliente.razao_social),
      email: cliente.email,
      phone: cliente.telefone,
      cnpj_cpf: cliente.cnpj_cpf,
      cidade: cliente.cidade,
      estado: cliente.estado,
    },
  };
}

async function enviarLote(entities) {
  const url = process.env.CRM_SYNC_URL;
  const token = process.env.CRM_TOKEN;
  if (!url || !token || token.startsWith("cole_o_token")) {
    throw new Error("CRM_SYNC_URL ou CRM_TOKEN não configurados no .env");
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ERP-Token": token },
    body: JSON.stringify({ entities }),
  });

  const texto = await resp.text();
  if (!resp.ok) throw new Error(`CRM respondeu ${resp.status}: ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`CRM devolveu resposta não-JSON: ${texto.slice(0, 200)}`);
  }
}

/**
 * Lê clientes do ERP e envia ao CRM em lotes.
 *
 * @param {string|Date|null} since Só clientes atualizados a partir desta data.
 * @returns resumo agregado dos lotes
 */
async function syncClientesToCRM(since = null) {
  const batchSize = Math.min(1000, Number(process.env.SYNC_BATCH_SIZE) || 500);
  const inicio = Date.now();

  const where = [];
  const params = [];
  if (since) {
    const d = since instanceof Date ? since : new Date(since);
    if (Number.isNaN(d.getTime())) throw new Error(`since inválido: ${since}`);
    where.push(`${COLUNAS.atualizado_em} >= ?`);
    params.push(d);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRows = await query(`SELECT COUNT(*) AS total FROM ${tabela()} ${whereSql}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  logger.info(`Sync iniciado: ${total} cliente(s)${since ? ` desde ${since}` : " (completo)"}`);

  const resumo = {
    total,
    lotes: 0,
    enviados: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    lotes_com_falha: [],
  };

  const selectList = Object.entries(COLUNAS).map(([a, c]) => `${c} AS ${a}`).join(", ");

  for (let offset = 0; offset < total; offset += batchSize) {
    const nLote = Math.floor(offset / batchSize) + 1;
    try {
      const rows = await query(
        `SELECT ${paginacao(batchSize, offset)} ${selectList} FROM ${tabela()} ${whereSql} ORDER BY ${COLUNAS.codigo_erp}`,
        params,
      );
      if (rows.length === 0) break;

      const entities = rows
        .map(normalizar)
        // Sem código não há chave de upsert: o CRM rejeitaria a linha de
        // qualquer forma, então nem enviamos.
        .filter((c) => c.codigo_erp)
        .map(paraEntidadeCRM);

      if (entities.length === 0) continue;

      const r = await enviarLote(entities);
      resumo.lotes++;
      resumo.enviados += entities.length;
      resumo.inserted += r.inserted ?? 0;
      resumo.updated += r.updated ?? 0;
      resumo.errors += r.errors ?? 0;
      logger.info(
        `Lote ${nLote}: ${entities.length} enviados -> +${r.inserted ?? 0} novos, ~${r.updated ?? 0} atualizados, ${r.errors ?? 0} erros`,
      );
    } catch (err) {
      /*
       * Um lote que falha não aborta o sync: com 13 mil registros, perder tudo
       * por causa de uma queda de rede no lote 20 seria pior que seguir e
       * reportar. Os lotes com falha ficam registrados para reprocessar.
       */
      resumo.lotes_com_falha.push({ lote: nLote, offset, erro: err.message });
      logger.error(`Lote ${nLote} (offset ${offset}) falhou: ${err.message}`);
    }
  }

  resumo.duracao_ms = Date.now() - inicio;
  logger.info(
    `Sync concluído em ${resumo.duracao_ms}ms: ${resumo.enviados}/${total} enviados, ` +
    `${resumo.inserted} novos, ${resumo.updated} atualizados, ` +
    `${resumo.errors} erros de entidade, ${resumo.lotes_com_falha.length} lote(s) com falha`,
  );
  return resumo;
}

module.exports = { syncClientesToCRM, paraEntidadeCRM, classificar };
