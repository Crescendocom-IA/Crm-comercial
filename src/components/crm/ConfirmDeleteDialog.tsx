import type { ReactNode } from "react";
import { useRole } from "@/hooks/useRole";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  /**
   * Botão que abre o diálogo. Quando presente, o componente se controla sozinho
   * e `open`/`onOpenChange` são desnecessários.
   *
   * NÃO use com um DropdownMenuItem: o menu desmonta o gatilho ao fechar e o
   * diálogo nunca aparece. Nesse caso, controle por estado (`open`) a partir do
   * componente pai, fora do DropdownMenuContent.
   */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ex: "Excluir 5 negócios?" ou "Excluir sequência?" */
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

/**
 * Confirmação padrão para ações destrutivas. Centraliza o texto e o estilo para
 * que toda exclusão do app tenha a mesma linguagem — antes nenhuma tinha
 * confirmação, e um clique errado apagava sem volta.
 */
export function ConfirmDeleteDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description = "Esta ação não pode ser desfeita.",
  confirmLabel = "Excluir",
  onConfirm,
}: Props) {
  const { canDelete } = useRole();

  /*
   * Em modo trigger o botão de excluir é este componente, então esconder aqui
   * cobre o call site inteiro — e nenhum ponto de exclusão fica esquecido.
   *
   * Isso NÃO vale para o modo controlado por estado: lá o botão vive no
   * componente pai e sumir só o diálogo deixaria um botão que não faz nada.
   * Esses call sites checam canDelete por conta própria.
   */
  if (trigger && !canDelete) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
