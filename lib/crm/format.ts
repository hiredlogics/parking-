import type { CaseType, KanbanStatus, Priority } from "./types";

export function humanCaseType(t: CaseType): string {
  switch (t) {
    case "PRIVATE_PARKING":
      return "Private Parking";
    case "COUNCIL_PCN":
      return "Council PCN";
    case "CHARGE_CERTIFICATE":
      return "Charge Certificate";
    case "ORDER_FOR_RECOVERY":
      return "Order for Recovery";
    case "COUNTY_COURT":
      return "County Court Claim";
    case "CCJ_REMOVAL":
      return "CCJ Removal";
    case "BAILIFF_ENFORCEMENT":
      return "Bailiff / Enforcement";
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatDate(iso: string, opts?: { time?: boolean }): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (!opts?.time) return date;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.round(month / 12)}y ago`;
}

export function statusColor(status: KanbanStatus): {
  bg: string;
  text: string;
  ring: string;
} {
  switch (status) {
    case "AWAITING_REVIEW":
      return { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" };
    case "IN_PROGRESS":
      return { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" };
    case "AWAITING_CLIENT":
      return { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" };
    case "READY_TO_DRAFT":
      return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200" };
    case "COMPLETED":
      return { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" };
  }
}

export function priorityColor(p: Priority): { bg: string; text: string } {
  switch (p) {
    case "LOW":
      return { bg: "bg-slate-100", text: "text-slate-600" };
    case "MEDIUM":
      return { bg: "bg-yellow-100", text: "text-yellow-700" };
    case "HIGH":
      return { bg: "bg-orange-100", text: "text-orange-700" };
    case "URGENT":
      return { bg: "bg-red-100", text: "text-red-700" };
  }
}
