import type { ReactNode } from "react";
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
