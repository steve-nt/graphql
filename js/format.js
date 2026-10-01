// XP and audit amounts are bytes; the platform shows them in base-1000 units.
export function formatBytes(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)} kB`;
  return `${Math.round(n)} B`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

export function formatDate(iso, options = { year: "numeric", month: "short", day: "numeric" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, options);
}

// "/athens/div-01/graphql" -> "graphql"
export function lastSegment(path) {
  return (path ?? "").split("/").filter(Boolean).pop() ?? "";
}
