/*
 * Mapeamento ERP → FlowCRM. Único lugar que conhece os nomes de coluna do ERP.
 *
 * Conferido contra o banco real (ERP.FDB, camada ERP_*):
 *   - A chave de cada entidade é o ID INTERNO (CLI_ID, PROD_ID, PEDIDO_ID,
 *     VEND_ID, ITEMPED_ID). Os pedidos apontam para CLI_ID em 100% dos casos;
 *     CLI_CODIGO só bate em 78% — por isso ele não serve de chave.
 *   - PEDIDO_TIPO: 'P' = pedido (venda), 'O' = orçamento.
 *   - Marca do produto vem como TEXTO (PROD_MARCA), não como id.
 *   - PROD_GRU_DESCRICAO vem "NAO CADASTRADO" em ~100% dos produtos, embora
 *     GRU_ID aponte para um grupo válido: o nome do grupo sai de ERP_GRUPO_PROD.
 *   - Toda tabela tem DATA_ULT_ALTERACAO → sync incremental.
 *
 * Cada entidade declara as colunas que lê (nunca SELECT *): ERP_VENDEDOR tem
 * VEND_SENHA, que não pode sair do servidor.
 *
 * `map(row)` recebe a linha com colunas em MAIÚSCULAS ou minúsculas (o
 * node-firebird usa lowercase_keys) e devolve { type, codigo_erp, data } no
 * formato que a edge function erp-sync espera.
 */

/** Normaliza as chaves da linha para MAIÚSCULAS. */
function upper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toUpperCase()] = v;
  return out;
}

/** Texto do Firebird: CHAR vem com espaços à direita; vazio vira null. */
function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\u0000/g, "").trim();
  return s === "" ? null : s;
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function id(v) {
  const n = numero(v);
  return n === null || n === 0 ? null : String(n);
}

/** 'S'/'N', 1/0, boolean → boolean (sem informação = true). */
function sim(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toUpperCase();
  return s === "S" || s === "1" || s === "T" || s === "SIM" || s === "TRUE";
}

/** "N" em *_INATIVO significa ativo. */
const ativoPorInativo = (v) => !sim(v === null || v === undefined ? "N" : v);

function data(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function dataHora(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/*
 * Cliente → empresa ou contato. 14 dígitos = CNPJ = empresa; 11 = CPF =
 * pessoa; sem documento, empresa se houver razão social diferente do nome.
 */
function classificar(doc, razao, nome) {
  if (doc && doc.length === 14) return "company";
  if (doc && doc.length === 11) return "contact";
  return razao && razao !== nome ? "company" : "contact";
}

const ENTIDADES = [
  {
    nome: "vendedores",
    tabela: "ERP_VENDEDOR",
    chave: "VEND_ID",
    colunas: ["VEND_ID", "VEND_CODIGO", "VEND_DESCRICAO", "VEND_EMAIL", "VEND_INATIVO", "DATA_ULT_ALTERACAO"],
    map: (r) => ({
      type: "seller",
      codigo_erp: id(r.VEND_ID),
      data: {
        code: texto(r.VEND_CODIGO),
        name: texto(r.VEND_DESCRICAO) || `Vendedor ${r.VEND_ID}`,
        email: texto(r.VEND_EMAIL)?.toLowerCase() ?? null,
        active: ativoPorInativo(r.VEND_INATIVO),
        erp_updated_at: dataHora(r.DATA_ULT_ALTERACAO),
      },
    }),
  },
  {
    nome: "grupos",
    tabela: "ERP_GRUPO_PROD",
    chave: "GRU_ID",
    colunas: ["GRU_ID", "GRU_DESCRICAO", "GRU_INATIVO", "DATA_ULT_ALTERACAO"],
    map: (r) => ({
      type: "product_group",
      codigo_erp: id(r.GRU_ID),
      data: {
        name: texto(r.GRU_DESCRICAO) || `Grupo ${r.GRU_ID}`,
        active: ativoPorInativo(r.GRU_INATIVO),
        erp_updated_at: dataHora(r.DATA_ULT_ALTERACAO),
      },
    }),
  },
  {
    nome: "produtos",
    tabela: "ERP_PRODUTO",
    chave: "PROD_ID",
    colunas: [
      "PROD_ID", "PROD_CODIGO", "PROD_DESCRICAO", "PROD_DESCRICAO_COMPL", "PROD_MARCA", "GRU_ID",
      "PROD_GRU_DESCRICAO", "PROD_SUBG_DESCRICAO", "PROD_UNIDADE", "PROD_COD_EAN", "PROD_NCM",
      "PROD_VALOR_CUSTO", "PROD_VALOR_VENDA", "PROD_MARGEM", "PROD_SALDO", "PROD_INATIVO",
      "PROD_DATA_CAD", "DATA_ULT_ALTERACAO",
    ],
    map: (r) => ({
      type: "product",
      codigo_erp: id(r.PROD_ID),
      data: {
        code: texto(r.PROD_CODIGO),
        name: texto(r.PROD_DESCRICAO) || `Produto ${r.PROD_ID}`,
        description: texto(r.PROD_DESCRICAO_COMPL),
        brand: texto(r.PROD_MARCA),
        group_codigo_erp: id(r.GRU_ID),
        group_name: texto(r.PROD_GRU_DESCRICAO) === "NAO CADASTRADO" ? null : texto(r.PROD_GRU_DESCRICAO),
        subgroup_name: texto(r.PROD_SUBG_DESCRICAO),
        unit: texto(r.PROD_UNIDADE),
        ean: texto(r.PROD_COD_EAN),
        ncm: texto(r.PROD_NCM),
        cost_price: numero(r.PROD_VALOR_CUSTO),
        sale_price: numero(r.PROD_VALOR_VENDA),
        margin: numero(r.PROD_MARGEM),
        stock: numero(r.PROD_SALDO),
        active: ativoPorInativo(r.PROD_INATIVO),
        erp_created_at: data(r.PROD_DATA_CAD),
        erp_updated_at: dataHora(r.DATA_ULT_ALTERACAO),
      },
    }),
  },
  {
    nome: "clientes",
    tabela: "ERP_CLIENTE",
    chave: "CLI_ID",
    colunas: [
      "CLI_ID", "CLI_RAZAOSOCIAL", "CLI_NOME", "CLI_CNPJ_CPF", "CLI_EMAIL", "CLI_CELULAR", "CLI_FONE",
      "CLI_CIDADE", "CLI_ESTADO", "CLI_ATIVO", "CLI_VEND", "DATA_ULT_ALTERACAO",
    ],
    map: (r) => {
      const doc = texto(r.CLI_CNPJ_CPF)?.replace(/\D/g, "") || null;
      const razao = texto(r.CLI_RAZAOSOCIAL);
      const nome = texto(r.CLI_NOME);
      const type = classificar(doc, razao, nome);
      return {
        type,
        codigo_erp: id(r.CLI_ID),
        data: {
          name: type === "company" ? (razao || nome) : (nome || razao),
          cnpj_cpf: doc,
          email: texto(r.CLI_EMAIL)?.toLowerCase() ?? null,
          phone: (texto(r.CLI_CELULAR) || texto(r.CLI_FONE))?.replace(/\D/g, "") || null,
          cidade: texto(r.CLI_CIDADE),
          estado: texto(r.CLI_ESTADO)?.toUpperCase() ?? null,
          active: sim(r.CLI_ATIVO),
          seller_codigo_erp: id(r.CLI_VEND),
        },
      };
    },
  },
  {
    nome: "pedidos",
    tabela: "ERP_PEDIDO",
    chave: "PEDIDO_ID",
    colunas: [
      "PEDIDO_ID", "PEDIDO_ERP", "PEDIDO_TIPO", "PEDIDO_STATUS", "PEDIDO_CLI", "PEDIDO_VENDEDOR",
      "PEDIDO_DATA", "PEDIDO_VALOR", "PEDIDO_DESCONTO", "PEDIDO_VALOR_TOTAL", "PEDIDO_PORTADOR",
      "PEDIDO_CONTATO", "PEDIDO_OBS", "DATA_ULT_ALTERACAO",
    ],
    map: (r) => ({
      type: "order",
      codigo_erp: id(r.PEDIDO_ID),
      data: {
        number: texto(r.PEDIDO_ERP),
        kind: texto(r.PEDIDO_TIPO)?.toUpperCase() === "O" ? "quote" : "order",
        status: texto(r.PEDIDO_STATUS),
        customer_codigo_erp: id(r.PEDIDO_CLI),
        seller_codigo_erp: id(r.PEDIDO_VENDEDOR),
        order_date: data(r.PEDIDO_DATA),
        subtotal: numero(r.PEDIDO_VALOR),
        discount: numero(r.PEDIDO_DESCONTO),
        total: numero(r.PEDIDO_VALOR_TOTAL),
        payment_codigo_erp: id(r.PEDIDO_PORTADOR),
        contact_name: texto(r.PEDIDO_CONTATO),
        notes: texto(r.PEDIDO_OBS),
        erp_updated_at: dataHora(r.DATA_ULT_ALTERACAO),
      },
    }),
  },
  {
    nome: "itens",
    tabela: "ERP_ITEM_PEDIDO",
    chave: "ITEMPED_ID",
    colunas: [
      "ITEMPED_ID", "ITEMPED_ID_PEDIDO", "ITEMPED_ID_PRODUTO", "ITEMPED_ID_CLIENTE", "ITEMPED_SEQ",
      "ITEMPED_PRODUTO", "ITEMPED_QUANT", "ITEMPED_VALOR_UNIT", "ITEMPED_VALOR_DESC", "ITEMPED_VALORTOTAL",
      "DATA_ULT_ALTERACAO",
    ],
    map: (r) => ({
      type: "order_item",
      codigo_erp: id(r.ITEMPED_ID),
      data: {
        order_codigo_erp: id(r.ITEMPED_ID_PEDIDO),
        product_codigo_erp: id(r.ITEMPED_ID_PRODUTO),
        customer_codigo_erp: id(r.ITEMPED_ID_CLIENTE),
        seq: numero(r.ITEMPED_SEQ),
        product_label: texto(r.ITEMPED_PRODUTO),
        quantity: numero(r.ITEMPED_QUANT),
        unit_price: numero(r.ITEMPED_VALOR_UNIT),
        discount: numero(r.ITEMPED_VALOR_DESC),
        total: numero(r.ITEMPED_VALORTOTAL),
        erp_updated_at: dataHora(r.DATA_ULT_ALTERACAO),
      },
    }),
  },
];

/** Converte uma linha do ERP em entidade do CRM (null se não tiver chave). */
function paraEntidade(entidade, row) {
  const e = entidade.map(upper(row));
  return e.codigo_erp ? e : null;
}

module.exports = { ENTIDADES, paraEntidade, classificar, texto, sim };
