// Hand-built SVG charts. Every chart redraws itself when its container is
// resized, has a hover/keyboard tooltip, and only uses textContent for data.

import { formatBytes, formatDate } from "./format.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  parent?.appendChild(node);
  return node;
}

function text(parent, content, attrs) {
  const node = el("text", attrs, parent);
  node.textContent = content;
  return node;
}

// Draw with the container's current width and redraw when it changes.
function responsive(container, draw) {
  container.__chartObserver?.disconnect();
  let lastWidth = 0;
  const run = () => {
    const width = Math.floor(container.clientWidth);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    container.replaceChildren();
    draw(width);
  };
  const observer = new ResizeObserver(run);
  observer.observe(container);
  container.__chartObserver = observer;
  run();
}

function createSvg(container, width, height, label) {
  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": label,
    class: "chart-svg",
  });
  container.appendChild(svg);
  return svg;
}

// One tooltip per chart, positioned inside the (position: relative) container.
function createTooltip(container) {
  const tip = document.createElement("div");
  tip.className = "chart-tooltip";
  tip.setAttribute("role", "status");
  tip.hidden = true;
  container.appendChild(tip);
  return {
    show(lines, x, y) {
      tip.replaceChildren(
        ...lines.map((line, i) => {
          const row = document.createElement("div");
          row.className = i === 0 ? "tip-title" : "tip-row";
          row.textContent = line;
          return row;
        }),
      );
      tip.hidden = false;
      const box = container.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let left = x + 12;
      if (left + tw > box.width) left = x - tw - 12;
      let top = y - th - 12;
      if (top < 0) top = y + 12;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${top}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

// Round ticks for an axis from 0 to max.
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

// Horizontal bar with a square baseline end and a 4px rounded data end.
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

function emptyState(container, message) {
  const p = document.createElement("p");
  p.className = "chart-empty";
  p.textContent = message;
  container.replaceChildren(p);
}

// ── Cumulative XP over time (area + line) ──────────────────────────────
// points: [{ date: Date, total: number, amount: number, name: string }]
export function renderXpTimeline(container, points) {
  container.__chartObserver?.disconnect();
  if (points.length === 0) return emptyState(container, "No XP earned yet.");

  responsive(container, (width) => {
    const height = 300;
    const m = { top: 16, right: 20, bottom: 36, left: 64 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const svg = createSvg(container, width, height, "Cumulative XP over time");
    const tip = createTooltip(container);

    // Start the line at zero on the first day.
    const series = [{ ...points[0], total: 0, amount: 0, start: true }, ...points];
    const t0 = series[0].date.getTime();
    const t1 = Math.max(series.at(-1).date.getTime(), t0 + 86400000);
    const yTicks = niceTicks(series.at(-1).total);
    const yMax = yTicks.at(-1);
    const sx = (d) => m.left + ((d.getTime() - t0) / (t1 - t0)) * iw;
    const sy = (v) => m.top + ih - (v / yMax) * ih;

    for (const v of yTicks) {
      el("line", { x1: m.left, x2: m.left + iw, y1: sy(v), y2: sy(v), class: v === 0 ? "axis-line" : "grid-line" }, svg);
      text(svg, formatBytes(v), { x: m.left - 8, y: sy(v), class: "axis-label", "text-anchor": "end", "dominant-baseline": "middle" });
    }

    const xTickCount = Math.max(2, Math.min(6, Math.floor(iw / 110)));
    for (let i = 0; i <= xTickCount; i++) {
      const d = new Date(t0 + ((t1 - t0) * i) / xTickCount);
      text(svg, formatDate(d.toISOString(), { month: "short", year: "2-digit" }), {
        x: sx(d),
        y: height - 12,
        class: "axis-label",
        "text-anchor": i === 0 ? "start" : i === xTickCount ? "end" : "middle",
      });
    }

    const line = series.map((p, i) => `${i ? "L" : "M"}${sx(p.date).toFixed(1)},${sy(p.total).toFixed(1)}`).join("");
    el("path", { d: `${line}L${sx(series.at(-1).date)},${sy(0)}L${sx(series[0].date)},${sy(0)}Z`, class: "area series-1" }, svg);
    el("path", { d: line, class: "line series-1" }, svg);

    const cross = el("line", { y1: m.top, y2: m.top + ih, class: "crosshair", visibility: "hidden" }, svg);
    const dot = el("circle", { r: 5, class: "dot series-1", visibility: "hidden" }, svg);
    const overlay = el("rect", {
      x: m.left, y: m.top, width: iw, height: ih,
      class: "hit-area", tabindex: 0,
      "aria-label": "XP timeline. Use the arrow keys to move between transactions.",
    }, svg);

    let index = series.length - 1;
    const focusPoint = (i) => {
      index = Math.max(1, Math.min(series.length - 1, i));
      const p = series[index];
      const x = sx(p.date);
      const y = sy(p.total);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("visibility", "visible");
      tip.show([formatDate(p.date.toISOString()), `+${formatBytes(p.amount)} · ${p.name}`, `Total: ${formatBytes(p.total)}`], x, y);
    };
    const clear = () => {
      cross.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      tip.hide();
    };
    overlay.addEventListener("pointermove", (event) => {
      const box = svg.getBoundingClientRect();
      const t = t0 + ((event.clientX - box.left - m.left) / iw) * (t1 - t0);
      let best = 1;
      for (let i = 1; i < series.length; i++) {
        if (Math.abs(series[i].date.getTime() - t) < Math.abs(series[best].date.getTime() - t)) best = i;
      }
      focusPoint(best);
    });
    overlay.addEventListener("pointerleave", clear);
    overlay.addEventListener("blur", clear);
    overlay.addEventListener("focus", () => focusPoint(index));
    overlay.addEventListener("keydown", (event) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
      if (!(event.key in moves)) return;
      event.preventDefault();
      const step = moves[event.key];
      focusPoint(Number.isFinite(step) ? index + step : step < 0 ? 1 : series.length - 1);
    });
  });
}

// ── Horizontal bars ───────────────────────────────────────────────────
// items: [{ label, value, className?, detail? }]
export function renderBarChart(container, items, { label, format = formatBytes, emptyMessage = "No data yet." } = {}) {
  container.__chartObserver?.disconnect();
  if (items.length === 0) return emptyState(container, emptyMessage);

  responsive(container, (width) => {
    const barH = 20;
    const gap = 10;
    const labelW = Math.min(170, Math.max(90, width * 0.32));
    const valueW = 72;
    const m = { top: 4, bottom: 4 };
    const height = m.top + m.bottom + items.length * (barH + gap) - gap;
    const iw = Math.max(20, width - labelW - valueW - 12);
    const max = Math.max(...items.map((d) => d.value), 1);
    const svg = createSvg(container, width, height, label);
    const tip = createTooltip(container);

    items.forEach((item, i) => {
      const y = m.top + i * (barH + gap);
      const w = Math.max(2, (item.value / max) * iw);
      const row = el("g", { class: "bar-row", tabindex: 0, "aria-label": `${item.label}: ${format(item.value)}` }, svg);
      el("rect", { x: 0, y: y - gap / 2, width, height: barH + gap, class: "row-hit" }, row);
      const name = text(row, item.label, { x: labelW - 10, y: y + barH / 2, class: "bar-label", "text-anchor": "end", "dominant-baseline": "middle" });
      // Shorten labels that would run into the bars.
      while (name.getComputedTextLength() > labelW - 14 && name.textContent.length > 4) {
        name.textContent = `${name.textContent.slice(0, -2)}…`;
      }
      el("path", { d: barPath(labelW, y, w, barH), class: `bar ${item.className ?? "series-1"}` }, row);
      text(row, format(item.value), { x: labelW + w + 8, y: y + barH / 2, class: "bar-value", "dominant-baseline": "middle" });

      const show = () => tip.show([item.label, format(item.value), ...(item.detail ? [item.detail] : [])], labelW + w, y);
      row.addEventListener("pointerenter", show);
      row.addEventListener("focus", show);
      row.addEventListener("pointerleave", tip.hide);
      row.addEventListener("blur", tip.hide);
    });
  });
}

// ── Donut ─────────────────────────────────────────────────────────────
// segments: [{ label, value, className }]
export function renderDonut(container, segments, { label, centerLabel, emptyMessage = "No data yet." } = {}) {
  container.__chartObserver?.disconnect();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return emptyState(container, emptyMessage);

  responsive(container, (width) => {
    const size = Math.min(width, 240);
    const r = size / 2 - 6;
    const inner = r * 0.62;
    const cx = width / 2;
    const cy = size / 2;
    const svg = createSvg(container, width, size, label);
    const tip = createTooltip(container);

    let angle = -Math.PI / 2;
    for (const seg of segments.filter((s) => s.value > 0)) {
      const sweep = (seg.value / total) * Math.PI * 2;
      const pct = Math.round((seg.value / total) * 100);
      const node = sweep >= Math.PI * 2 - 1e-6
        ? el("circle", { cx, cy, r: (r + inner) / 2, class: `donut-ring ${seg.className}`, "stroke-width": r - inner }, svg)
        : el("path", { d: arc(cx, cy, r, inner, angle, angle + sweep), class: `donut-seg ${seg.className}` }, svg);
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", `${seg.label}: ${seg.value} (${pct}%)`);
      const mid = angle + sweep / 2;
      const show = () => tip.show([seg.label, `${seg.value} (${pct}%)`], cx + Math.cos(mid) * r, cy + Math.sin(mid) * r);
      node.addEventListener("pointerenter", show);
      node.addEventListener("focus", show);
      node.addEventListener("pointerleave", tip.hide);
      node.addEventListener("blur", tip.hide);
      angle += sweep;
    }

    text(svg, String(total), { x: cx, y: cy - 4, class: "donut-total", "text-anchor": "middle" });
    text(svg, centerLabel ?? "total", { x: cx, y: cy + 16, class: "axis-label", "text-anchor": "middle" });
  });
}

function arc(cx, cy, r, inner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (radius, a) => `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
  return `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(inner, a1)}A${inner},${inner} 0 ${large} 0 ${p(inner, a0)}Z`;
}

// ── Radar (skills, 0–100) ────────────────────────────────────────────
// items: [{ label, value }]
export function renderRadar(container, items, { label } = {}) {
  container.__chartObserver?.disconnect();
  if (items.length < 3) {
    return renderBarChart(container, items, { label, format: (v) => `${v}%`, emptyMessage: "No skills recorded yet." });
  }

  responsive(container, (width) => {
    const height = Math.min(width, 360);
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width / 2 - 70, height / 2 - 28);
    const n = items.length;
    const angleAt = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const point = (i, v) => [cx + Math.cos(angleAt(i)) * r * (v / 100), cy + Math.sin(angleAt(i)) * r * (v / 100)];
    const svg = createSvg(container, width, height, label);
    const tip = createTooltip(container);

    for (const level of [25, 50, 75, 100]) {
      const ring = items.map((_, i) => point(i, level).join(",")).join(" ");
      el("polygon", { points: ring, class: "grid-line radar-ring" }, svg);
    }
    items.forEach((item, i) => {
      const [x, y] = point(i, 100);
      el("line", { x1: cx, y1: cy, x2: x, y2: y, class: "grid-line" }, svg);
      const [lx, ly] = point(i, 116);
      const cos = Math.cos(angleAt(i));
      text(svg, item.label, {
        x: lx,
        y: ly,
        class: "axis-label radar-label",
        "text-anchor": Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end",
        "dominant-baseline": "middle",
      });
    });

    const shape = items.map((item, i) => point(i, item.value).join(",")).join(" ");
    el("polygon", { points: shape, class: "area series-1" }, svg);
    el("polygon", { points: shape, class: "line series-1" }, svg);

    items.forEach((item, i) => {
      const [x, y] = point(i, item.value);
      const g = el("g", { tabindex: 0, "aria-label": `${item.label}: ${item.value}%` }, svg);
      el("circle", { cx: x, cy: y, r: 14, class: "row-hit" }, g);
      el("circle", { cx: x, cy: y, r: 4, class: "dot series-1" }, g);
      const show = () => tip.show([item.label, `${item.value}%`], x, y);
      g.addEventListener("pointerenter", show);
      g.addEventListener("focus", show);
      g.addEventListener("pointerleave", tip.hide);
      g.addEventListener("blur", tip.hide);
    });
  });
}
