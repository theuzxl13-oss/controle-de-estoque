import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Search, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

// ---------------------------------------------------------------- formatação
const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const brl = (n: number) => brlFmt.format(n);
export const num = (n: number) => numFmt.format(n);
export const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR");
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- botões
type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-bad text-white hover:brightness-110",
};

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition outline-none",
    "focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none",
    size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
    variants[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(buttonClass(variant, size), className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------- superfícies
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- badges
export type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- formulário
const fieldBase =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none transition placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, "h-9", className)} {...p} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldBase, "h-9 pr-8", className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "min-h-20 py-2", className)} {...p} />;
}
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-fg-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

// ---------------------------------------------------------------- tabela
export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs font-medium text-fg-3">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:whitespace-nowrap">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-fg-3">Nenhum registro encontrado.</p>}
    </div>
  );
}

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [page, pages]);
  const slice = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  const control = (
    <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-fg-3">
      <span>
        {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, items.length)} de {items.length}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular px-1">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" aria-label="Próxima página" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
  return { slice, control, setPage };
}

// ---------------------------------------------------------------- modal
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-2xl", width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="no-print flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Fechar" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="no-print flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toasts e confirmação
interface ToastItem {
  id: number;
  tone: "good" | "bad" | "info";
  text: string;
}
interface Feedback {
  toast: (tone: ToastItem["tone"], text: string) => void;
  /** Executa a ação e mostra sucesso ou o erro de regra de negócio. */
  run: (fn: () => void, success?: string) => boolean;
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}
const FeedbackCtx = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<null | {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    resolve: (v: boolean) => void;
  }>(null);

  const toast = useCallback((tone: ToastItem["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const run = useCallback(
    (fn: () => void, success?: string) => {
      try {
        fn();
        if (success) toast("good", success);
        return true;
      } catch (e) {
        toast("bad", e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [toast],
  );

  const confirm: Feedback["confirm"] = useCallback(
    (opts) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <FeedbackCtx.Provider value={{ toast, run, confirm }}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "good" ? CheckCircle2 : t.tone === "bad" ? XCircle : Info;
          return (
            <div
              key={t.id}
              className={cx(
                "pointer-events-auto flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-lg",
              )}
            >
              <Icon className={cx("mt-0.5 size-4 shrink-0", t.tone === "good" ? "text-good" : t.tone === "bad" ? "text-bad" : "text-info")} />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
      <Modal
        open={dialog !== null}
        title={dialog?.title ?? ""}
        onClose={() => close(false)}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Voltar</Button>
            <Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {dialog?.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        <div className="flex gap-3 text-sm text-fg-2">
          {dialog?.danger && <AlertTriangle className="size-5 shrink-0 text-bad" />}
          <p>{dialog?.message}</p>
        </div>
      </Modal>
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const f = useContext(FeedbackCtx);
  if (!f) throw new Error("FeedbackProvider ausente");
  return f;
}

// ---------------------------------------------------------------- indicadores
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left",
        onClick && "transition hover:border-accent/50",
      )}
    >
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", tone ? tones[tone] : "bg-accent-soft text-accent")}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-fg-3">{label}</span>
        <span className="tabular mt-0.5 block truncate text-lg font-semibold">{value}</span>
        {hint && <span className="mt-0.5 block text-xs text-fg-3">{hint}</span>}
      </span>
    </Comp>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === i.value ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg",
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div className={cx("flex gap-2 rounded-lg px-3 py-2.5 text-sm", tone === "info" ? "bg-info-soft text-info" : "bg-warn-soft text-warn")}>
      {tone === "info" ? <Info className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
