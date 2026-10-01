import { login, logout, getToken, getUserIdFromToken } from "./auth.js";
import { request, AuthError, USER_QUERY, LEVEL_QUERY, XP_QUERY, PROGRESS_QUERY, SKILLS_QUERY, AUDITS_QUERY } from "./api.js";
import { renderXpTimeline, renderBarChart, renderDonut, renderRadar } from "./charts.js";
import { formatBytes, formatDate, formatNumber, lastSegment } from "./format.js";
import { initGraphiql } from "./graphiql.js";
import { TOKEN_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);

const views = {
  login: $("login-view"),
  profile: $("profile-view"),
  graphiql: $("graphiql-view"),
};

let profileLoaded = false;

// ── Routing ───────────────────────────────────────────────────────────

function route() {
  const token = getToken();
  if (!token) return showLogin();

  const page = location.hash === "#graphiql" ? "graphiql" : "profile";
  $("topbar").hidden = false;
  for (const [name, view] of Object.entries(views)) view.hidden = name !== page;
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.tab === page) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  document.title = page === "graphiql" ? "GraphiQL · Zone01 Profile" : "Zone01 Profile";

  if (page === "profile" && !profileLoaded) loadProfile();
  if (page === "graphiql") initGraphiql({ onAuthError: handleAuthError });
}

function showLogin(message) {
  $("topbar").hidden = true;
  for (const [name, view] of Object.entries(views)) view.hidden = name !== "login";
  document.title = "Sign in · Zone01 Profile";
  setLoginError(message);
  $("identifier").focus();
}

function setLoginError(message) {
  const box = $("login-error");
  box.textContent = message ?? "";
  box.hidden = !message;
}

function handleAuthError(error) {
  logout();
  profileLoaded = false;
  showLogin(error?.message);
}

// ── Login / logout ───────────────────────────────────────────────────

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("login-button");
  const identifier = $("identifier").value;
  const password = $("password").value;

  setLoginError();
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await login(identifier, password);
    $("password").value = "";
    profileLoaded = false;
    if (location.hash === "#profile" || location.hash === "") route();
    else location.hash = "#profile";
  } catch (error) {
    setLoginError(error.message);
    $("password").select();
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("toggle-password").addEventListener("click", (event) => {
  const input = $("password");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  event.currentTarget.textContent = show ? "Hide" : "Show";
  event.currentTarget.setAttribute("aria-pressed", String(show));
});

$("logout-button").addEventListener("click", () => {
  logout();
  profileLoaded = false;
  $("profile-content").hidden = true;
  $("identifier").value = "";
  history.replaceState(null, "", location.pathname);
  showLogin();
});

// Log out in every open tab when one of them logs out.
window.addEventListener("storage", (event) => {
  if (event.key === null || (event.key === TOKEN_KEY && !event.newValue)) route();
});

// ── Theme ────────────────────────────────────────────────────────────

$("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme
    ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Storage blocked; the theme still applies for this visit.
  }
});

// ── Profile ──────────────────────────────────────────────────────────

function setStatus(message, { error = false, retry = false } = {}) {
  const box = $("profile-status");
  box.replaceChildren();
  box.className = `status${error ? " status-error" : ""}`;
  if (!message) return;
  const p = document.createElement("p");
  if (!error) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    p.append(spinner);
  }
  p.append(message);
  box.append(p);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button ghost";
    button.textContent = "Try again";
    button.addEventListener("click", loadProfile);
    box.append(button);
  }
}

function setField(name, value) {
  for (const node of document.querySelectorAll(`[data-field="${name}"]`)) {
    node.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
  }
}

// The event to show: ?event=<id> in the URL, else the one holding the
// user's highest non-piscine level (the main curriculum, e.g. div-01).
function pickEvent(levels) {
  const fromUrl = Number(new URLSearchParams(location.search).get("event"));
  const main = levels.find((t) => !/piscine/i.test(t.path ?? "")) ?? levels[0];
  if (Number.isInteger(fromUrl) && fromUrl > 0) {
    const match = levels.find((t) => t.eventId === fromUrl);
    return { eventId: fromUrl, level: match?.amount ?? 0 };
  }
  return { eventId: main?.eventId ?? null, level: main?.amount ?? 0 };
}

async function loadProfile() {
  profileLoaded = true;
  $("profile-content").hidden = true;
  setStatus("Loading your profile…");

  try {
    const { user: users } = await request(USER_QUERY);
    const user = users?.[0];
    if (!user) throw new Error("No user data was returned for this account.");
    const userId = user.id ?? getUserIdFromToken(getToken());

    const { transaction: levels } = await request(LEVEL_QUERY, { userId });
    const { eventId, level } = pickEvent(levels ?? []);

    const [xp, progress, skills, audits] = await Promise.allSettled([
      eventId ? request(XP_QUERY, { userId, eventId }).then((d) => d.transaction) : Promise.resolve([]),
      eventId ? request(PROGRESS_QUERY, { userId, eventId }).then((d) => d.progress) : Promise.resolve([]),
      request(SKILLS_QUERY, { userId }).then((d) => d.transaction),
      request(AUDITS_QUERY, { userId }).then((d) => d.audit),
    ]);

    const authFailure = [xp, progress, skills, audits].find((r) => r.status === "rejected" && r.reason instanceof AuthError);
    if (authFailure) throw authFailure.reason;

    // Optional data: show the rest of the page even if one query fails.
    const value = (r) => (r.status === "fulfilled" ? r.value ?? [] : []);
    const failed = [xp, progress, skills, audits].filter((r) => r.status === "rejected");
    for (const f of failed) console.warn("Query failed:", f.reason);

    $("profile-content").hidden = false;
    renderProfile({ user, level, xp: value(xp), progress: value(progress), skills: value(skills), audits: value(audits) });
    setStatus(failed.length ? "Some data could not be loaded, so parts of the page may be empty." : "", { error: failed.length > 0, retry: failed.length > 0 });
  } catch (error) {
    if (error instanceof AuthError) return handleAuthError(error);
    profileLoaded = false;
    setStatus(error.message || "Something went wrong while loading your profile.", { error: true, retry: true });
  }
}

function renderProfile({ user, level, xp, progress, skills, audits }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  setField("displayName", user.firstName || user.login);
  setField("login", user.login);
  setField("fullName", fullName);
  setField("email", user.email);
  setField("id", user.id);
  setField("campus", user.campus ? user.campus[0].toUpperCase() + user.campus.slice(1) : "");
  setField("createdAt", formatDate(user.createdAt));

  // XP
  const totalXp = xp.reduce((sum, t) => sum + t.amount, 0);
  const passed = new Set(progress.filter((p) => p.grade >= 1).map((p) => p.object?.name ?? lastSegment(p.path)));
  const last = xp.at(-1);
  setField("level", level);
  setField("totalXp", formatBytes(totalXp));
  document.querySelector('[data-field="totalXp"]').title = `${formatNumber(totalXp)} bytes`;
  setField("projectsPassed", passed.size);
  setField("lastXp", last ? `${formatBytes(last.amount)} · ${projectName(last)}` : "");

  // Audits
  const ratio = Number(user.auditRatio) || 0;
  setField("auditRatio", ratio.toFixed(1));
  setField("auditsDone", audits.length);
  setField("totalUp", formatBytes(user.totalUp));
  setField("totalDown", formatBytes(user.totalDown));

  renderRecentProjects(progress);
  renderRecentAudits(audits);

  // Charts
  let running = 0;
  const timeline = xp.map((t) => {
    running += t.amount;
    return { date: new Date(t.createdAt), total: running, amount: t.amount, name: projectName(t) };
  });
  renderXpTimeline($("chart-xp-time"), timeline);
  renderTable($("table-xp-time"), ["Date", "Project", "XP", "Total"],
    timeline.map((p) => [formatDate(p.date.toISOString()), p.name, formatBytes(p.amount), formatBytes(p.total)]));

  const byProject = new Map();
  for (const t of xp) byProject.set(projectName(t), (byProject.get(projectName(t)) ?? 0) + t.amount);
  const projects = [...byProject].map(([label, v]) => ({ label, value: v })).sort((a, b) => b.value - a.value);
  renderBarChart($("chart-xp-project"), projects.slice(0, 12), { label: "XP by project", emptyMessage: "No project XP yet." });
  renderTable($("table-xp-project"), ["Project", "XP"], projects.map((p) => [p.label, formatBytes(p.value)]));

  const skillMap = new Map();
  for (const s of skills) {
    const name = s.type.replace(/^skill_/, "").replace(/[-_]/g, " ");
    skillMap.set(name, Math.max(skillMap.get(name) ?? 0, s.amount));
  }
  const skillItems = [...skillMap].map(([label, v]) => ({ label: titleCase(label), value: v })).sort((a, b) => b.value - a.value);
  renderRadar($("chart-skills"), skillItems.slice(0, 8), { label: "Skills" });
  renderTable($("table-skills"), ["Skill", "Score"], skillItems.map((s) => [s.label, `${s.value}%`]));

  renderBarChart($("chart-audit"), [
    { label: "Done", value: Number(user.totalUp) || 0, className: "series-1" },
    { label: "Received", value: Number(user.totalDown) || 0, className: "series-2" },
  ], { label: "Audit XP done compared with received" });
  $("audit-note").textContent = ratio >= 1
    ? `Ratio ${ratio.toFixed(1)}: you have audited more than you have been audited.`
    : `Ratio ${ratio.toFixed(1)}: you have been audited more than you have audited.`;

  const passCount = progress.filter((p) => p.grade >= 1).length;
  const failCount = progress.length - passCount;
  renderDonut($("chart-pass-fail"), [
    { label: "Pass", value: passCount, className: "status-good" },
    { label: "Fail", value: failCount, className: "status-critical" },
  ], { label: "Project attempts passed and failed", centerLabel: "attempts", emptyMessage: "No finished projects yet." });
  renderLegend($("legend-pass-fail"), [
    { label: "Pass", value: passCount, className: "status-good", icon: "✓" },
    { label: "Fail", value: failCount, className: "status-critical", icon: "✕" },
  ], progress.length);
}

function projectName(transaction) {
  return transaction.object?.name ?? lastSegment(transaction.path);
}

const ACRONYMS = new Set(["js", "sql", "html", "css", "ai", "cpp", "ui", "ux"]);

function titleCase(text) {
  return text.replace(/\b\w+/g, (w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
}

function badge(pass) {
  const span = document.createElement("span");
  span.className = `badge ${pass ? "badge-pass" : "badge-fail"}`;
  span.textContent = pass ? "✓ Pass" : "✕ Fail";
  return span;
}

function listItem(title, subtitle, pass) {
  const li = document.createElement("li");
  const body = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("span");
  small.className = "muted";
  small.textContent = subtitle;
  body.append(strong, small);
  li.append(body, badge(pass));
  return li;
}

function renderRecentProjects(progress) {
  const list = $("recent-projects");
  list.replaceChildren(...progress.slice(0, 6).map((p) =>
    listItem(p.object?.name ?? lastSegment(p.path), formatDate(p.updatedAt), p.grade >= 1)));
  if (!progress.length) list.append(emptyItem("No finished projects yet."));
}

function renderRecentAudits(audits) {
  const list = $("recent-audits");
  list.replaceChildren(...audits.slice(0, 6).map((a) =>
    listItem(lastSegment(a.group?.path), `Group of ${a.group?.captainLogin ?? "unknown"} · ${formatDate(a.createdAt)}`, a.grade >= 1)));
  if (!audits.length) list.append(emptyItem("No audits yet."));
}

function emptyItem(message) {
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = message;
  return li;
}

function renderLegend(list, items, total) {
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `swatch ${item.className}`;
    swatch.setAttribute("aria-hidden", "true");
    const pct = total ? Math.round((item.value / total) * 100) : 0;
    li.append(swatch, `${item.icon} ${item.label}: ${item.value} (${pct}%)`);
    return li;
  }));
}

function renderTable(container, headers, rows) {
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const h of headers) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) tr.insertCell().textContent = cell;
  }
  const empty = document.createElement("p");
  empty.className = "muted";
  empty.textContent = "No data.";
  container.replaceChildren(rows.length ? table : empty);
}

// ── Start ────────────────────────────────────────────────────────────

window.addEventListener("hashchange", route);
route();
