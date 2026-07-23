export { useIndustriesQuery as useIndustries, DEFAULT_INDUSTRIES } from "@/hooks/queries/useOrgOptions";

/*
 * Mantido como reexport: o hook era um useEffect+fetch próprio e disparava uma
 * requisição por componente montado — em Empresas, três ao mesmo tempo (página,
 * drawer e modal) para ler o mesmo campo `settings` da organização. A
 * implementação em React Query dedupe isso numa chave só.
 *
 * O nome antigo continua valendo para os 5 pontos que já o importam; a
 * assinatura { industries, loading } não mudou.
 */