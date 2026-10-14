import type { Tone } from "./components/ui";
import type { MovementType, PurchaseStatus } from "./data/types";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase_receipt: "Recebimento de compra",
  sale: "Venda",
  sale_cancellation: "Cancelamento de venda",
  manual_entry: "Entrada manual",
  manual_exit: "Saída manual",
  adjustment: "Ajuste de saldo",
  inventory: "Inventário",
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  sent: { label: "Enviado", tone: "info" },
  confirmed: { label: "Confirmado", tone: "info" },
  partially_received: { label: "Parcialmente recebido", tone: "warn" },
  received: { label: "Recebido", tone: "good" },
  cancelled: { label: "Cancelado", tone: "bad" },
};

export const TITLE_STATUS = {
  open: { label: "Em aberto", tone: "info" },
  partially_paid: { label: "Parcial", tone: "warn" },
  paid: { label: "Pago", tone: "good" },
  cancelled: { label: "Cancelado", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
