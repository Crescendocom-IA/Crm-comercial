/*
 * O PostgREST devolve no máximo 1.000 linhas por requisição — o excedente é
 * cortado sem erro. Com a base do ERP (12 mil empresas, 11 mil contatos),
 * toda leitura "da lista inteira" (exportar, deduplicar importação,
 * relatórios, opções de select) precisa paginar.
 *
 * `build(from, to)` monta a query de UMA página com .range(from, to); a
 * ordenação deve ser estável (ex.: por id) para nenhuma linha pular entre
 * páginas.
 */

export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
