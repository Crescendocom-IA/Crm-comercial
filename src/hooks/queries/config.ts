/**
 * Tempos de frescor por tipo de dado, para todas as queries do CRM.
 *
 * O default do QueryClient em App.tsx cobre o caso "lista"; os outros dois são
 * aplicados query a query. Centralizados aqui para que Contatos, Empresas e
 * Negócios não acabem cada um com um número diferente escolhido no calor do
 * momento — foi para isso que Contatos virou o primeiro a migrar.
 */
export const STALE_TIME = {
  /** Listas paginadas: mudam com frequência, mas não a cada segundo. */
  list: 30_000,
  /** Registro individual aberto num drawer/página: muda menos. */
  detail: 60_000,
  /** Contagens e KPIs derivados: o número errado por 1min é pior que a query. */
  counts: 15_000,
} as const;
