import { useState, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  entityType: "contacts" | "companies";
}

const contactFields = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Sobrenome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "title", label: "Cargo" },
  { key: "status", label: "Status" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "cnpj_cpf", label: "CNPJ/CPF" },
  { key: "codigo_erp", label: "Código ERP" },
  { key: "__skip", label: "— Ignorar —" },
];

const companyFields = [
  { key: "name", label: "Nome" },
  { key: "domain", label: "Domínio" },
  { key: "industry", label: "Indústria" },
  { key: "size", label: "Tamanho" },
  { key: "revenue", label: "Receita" },
  { key: "website", label: "Website" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "cnpj_cpf", label: "CNPJ/CPF" },
  { key: "codigo_erp", label: "Código ERP" },
  { key: "__skip", label: "— Ignorar —" },
];

/*
 * Sinônimos de cabeçalho para o auto-map. Cobre PT, os exports do HubSpot
 * ("First Name", "Last Name", "Email") e do Pipedrive ("Person - Name",
 * "Organization - Name") — os formatos que a UI de Integrações anuncia. Um
 * cabeçalho casa por igualdade OU por inclusão (ex.: "email address" contém
 * "email"), então termos curtos e distintos evitam falso-positivo.
 */
const HEADER_SYNONYMS: Record<string, string[]> = {
  first_name: ["nome", "primeiro nome", "first name", "firstname", "person - name", "contato - nome", "full name"],
  last_name: ["sobrenome", "last name", "lastname", "surname"],
  email: ["email", "e-mail", "email address", "endereco de email"],
  phone: ["telefone", "phone", "phone number", "celular", "mobile", "whatsapp"],
  title: ["cargo", "job title", "position", "titulo"],
  name: ["empresa", "company", "company name", "organization - name", "organizacao", "razao social", "nome da empresa"],
  domain: ["dominio", "domain"],
  website: ["website", "site", "web site"],
  industry: ["industria", "industry", "setor", "segmento"],
  cnpj_cpf: ["cnpj", "cpf", "cnpj/cpf", "cnpj_cpf", "documento", "tax id"],
  codigo_erp: ["codigo erp", "codigo_erp", "cod erp", "id erp", "erp id", "codigo do erp"],
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // casa "organização" com "organizacao"
const normHeader = (h: string) =>
  stripAccents(h.trim().toLowerCase()).replace(/["']/g, "").replace(/\s+/g, " ");

export function CSVImportModal({ open, onOpenChange, onImported, entityType }: CSVImportModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);

  const fields = entityType === "contacts" ? contactFields : companyFields;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Papa lida com aspas, vírgulas e quebras de linha dentro de campos — o split
    // manual em "," e "\n" corrompia qualquer célula com vírgula/aspas.
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as string[][]).filter((r) => r.some((c) => (c ?? "").trim()));
        if (rows.length < 2) { toast({ title: "CSV vazio ou inválido", variant: "destructive" }); return; }
        const headers = rows[0].map((h) => (h ?? "").trim());
        setCsvHeaders(headers);
        setCsvRows(rows.slice(1));
        // Auto-map por nome de cabeçalho: casa por rótulo/chave exatos ou por
        // sinônimo (igualdade ou inclusão), cobrindo HubSpot e Pipedrive.
        const autoMap: Record<number, string> = {};
        headers.forEach((header, i) => {
          const h = normHeader(header);
          const match = fields.find((f) => {
            if (f.key === "__skip") return false;
            if (normHeader(f.label) === h || f.key === h) return true;
            const syns = HEADER_SYNONYMS[f.key] || [];
            return syns.some((syn) => h === syn || h.includes(syn));
          });
          autoMap[i] = match?.key || "__skip";
        });
        setMapping(autoMap);
        setStep("mapping");
      },
      error: () => { toast({ title: "Erro ao ler o CSV", variant: "destructive" }); },
    });
  };

  const handleImport = async () => {
    if (!orgId) return;
    setImporting(true);
    try {
      // 1. Monta os registros só com os campos mapeados (célula vazia → null).
      const clean = (v: any) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
      const mapped = csvRows.map((row) => {
        const rec: Record<string, any> = {};
        Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
          if (fieldKey !== "__skip") rec[fieldKey] = clean(row[Number(colIdx)]);
        });
        return rec;
      });

      // 2. Descarta linhas sem o campo obrigatório (nunca importa lixo).
      const requiredKey = entityType === "contacts" ? "first_name" : "name";
      const withRequired = mapped.filter((r) => r[requiredKey]);
      const skippedNoRequired = mapped.length - withRequired.length;

      if (withRequired.length === 0) {
        toast({
          title: "Nenhum registro válido",
          description: `Toda linha precisa de ${entityType === "contacts" ? "Nome" : "Nome da empresa"}.`,
          variant: "destructive",
        });
        setImporting(false);
        return;
      }

      // 3. Chave de dedupe por registro.
      //    Contato: email > codigo_erp. Empresa: cnpj_cpf > nome normalizado.
      const normEmail = (v: any) => (v ?? "").toString().trim().toLowerCase();
      const normName = (v: any) => stripAccents((v ?? "").toString().trim().toLowerCase()).replace(/\s+/g, " ");
      const onlyDigits = (v: any) => (v ?? "").toString().replace(/\D/g, "");
      const keyOf = (r: Record<string, any>): { field: "email" | "codigo_erp" | "cnpj_cpf" | "name"; val: string } | null => {
        if (entityType === "contacts") {
          if (r.email) return { field: "email", val: normEmail(r.email) };
          if (r.codigo_erp) return { field: "codigo_erp", val: String(r.codigo_erp).trim() };
          return null; // sem chave: inserido, nunca descartado
        }
        if (r.cnpj_cpf && onlyDigits(r.cnpj_cpf)) return { field: "cnpj_cpf", val: onlyDigits(r.cnpj_cpf) };
        return { field: "name", val: normName(r.name) };
      };

      // 4. Índice dos registros já existentes na org, por cada chave possível.
      const existing = {
        email: new Map<string, string>(),
        codigo_erp: new Map<string, string>(),
        cnpj_cpf: new Map<string, string>(),
        name: new Map<string, string>(),
      };
      if (entityType === "contacts") {
        const { data, error } = await supabase.from("contacts")
          .select("id,email,codigo_erp").eq("org_id", orgId);
        if (error) { toast({ title: "Erro ao ler contatos existentes", description: error.message, variant: "destructive" }); setImporting(false); return; }
        (data || []).forEach((c: any) => {
          if (c.email) existing.email.set(normEmail(c.email), c.id);
          if (c.codigo_erp) existing.codigo_erp.set(String(c.codigo_erp).trim(), c.id);
        });
      } else {
        const { data, error } = await supabase.from("companies")
          .select("id,name,cnpj_cpf").eq("org_id", orgId);
        if (error) { toast({ title: "Erro ao ler empresas existentes", description: error.message, variant: "destructive" }); setImporting(false); return; }
        (data || []).forEach((c: any) => {
          if (c.cnpj_cpf && onlyDigits(c.cnpj_cpf)) existing.cnpj_cpf.set(onlyDigits(c.cnpj_cpf), c.id);
          if (c.name) existing.name.set(normName(c.name), c.id);
        });
      }

      // 5. Particiona: novos × atualizações, deduplicando também dentro do arquivo.
      const toInsert: Record<string, any>[] = [];
      const toUpdate: Record<string, any>[] = [];
      const batchKeys = new Set<string>();
      let insertedNoKey = 0;
      let skippedDupInFile = 0;

      for (const r of withRequired) {
        const key = keyOf(r);
        if (!key) {
          toInsert.push({ ...r, org_id: orgId, owner_id: user?.id });
          insertedNoKey++;
          continue;
        }
        const dedupeKey = `${key.field}:${key.val}`;
        if (batchKeys.has(dedupeKey)) { skippedDupInFile++; continue; }
        batchKeys.add(dedupeKey);

        const existingId = existing[key.field].get(key.val);
        if (existingId) {
          // Só os campos mapeados + as colunas NOT NULL exigidas pelo upsert;
          // owner_id fica de fora para não roubar a titularidade do registro.
          toUpdate.push({ id: existingId, org_id: orgId, ...r });
        } else {
          toInsert.push({ ...r, org_id: orgId, owner_id: user?.id });
        }
      }

      // 6. Executa. Update por PK (id) num único upsert; insert em lote.
      let inserted = 0;
      let updated = 0;
      if (toUpdate.length) {
        const { error } = await supabase.from(entityType).upsert(toUpdate as any, { onConflict: "id" });
        if (error) { toast({ title: "Erro ao atualizar existentes", description: error.message, variant: "destructive" }); setImporting(false); return; }
        updated = toUpdate.length;
      }
      if (toInsert.length) {
        const { error } = await supabase.from(entityType).insert(toInsert as any);
        if (error) { toast({ title: "Erro ao inserir novos", description: error.message, variant: "destructive" }); setImporting(false); return; }
        inserted = toInsert.length;
      }

      // 7. Resumo honesto: novos / atualizados / ignorados, com o detalhe.
      const skipped = skippedNoRequired + skippedDupInFile;
      const resumo = [`${inserted} novos`, `${updated} atualizados`];
      if (skipped > 0) resumo.push(`${skipped} ignorados`);
      const detalhe: string[] = [];
      if (insertedNoKey > 0) detalhe.push(`${insertedNoKey} sem chave (podem duplicar se reimportados)`);
      if (skippedDupInFile > 0) detalhe.push(`${skippedDupInFile} duplicados no arquivo`);
      if (skippedNoRequired > 0) detalhe.push(`${skippedNoRequired} sem campo obrigatório`);
      toast({
        title: "Importação concluída",
        description: resumo.join(", ") + (detalhe.length ? ` · ${detalhe.join("; ")}` : ""),
      });

      onOpenChange(false);
      onImported();
      resetState();
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo CSV para importar"}
            {step === "mapping" && "Mapeie as colunas do CSV para os campos"}
            {step === "preview" && `Preview: ${csvRows.length} registros`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Arraste ou selecione um arquivo .csv</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()}>
              <FileText className="mr-2 h-4 w-4" />Selecionar Arquivo
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {csvHeaders.map((header, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm font-medium">{header}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select value={mapping[i] || "__skip"} onValueChange={(v) => setMapping({ ...mapping, [i]: v })}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={() => setStep("preview")}>Preview</Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="rounded-md border border-border max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([i, key]) => (
                      <TableHead key={i} className="text-xs">{fields.find((f) => f.key === key)?.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 5).map((row, ri) => (
                    <TableRow key={ri}>
                      {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([i]) => (
                        <TableCell key={i} className="text-xs">{row[Number(i)]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {csvRows.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">... e mais {csvRows.length - 5} registros</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importando..." : `Importar ${csvRows.length} registros`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
