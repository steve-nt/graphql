// A small GraphiQL: query + variables editors, example queries, a result
// pane and a schema browser built from an introspection query.

import { rawRequest, AuthError, USER_QUERY, XP_QUERY } from "./api.js";
import { getToken, getUserIdFromToken } from "./auth.js";

const $ = (id) => document.getElementById(id);

const EXAMPLES = [
  { name: "Normal: current user", query: USER_QUERY, variables: () => ({}) },
  {
    name: "Arguments: object by id",
    query: `query Object($id: Int!) {
  object(where: { id: { _eq: $id } }) {
    id
    name
    type
    attrs
  }
}`,
    variables: () => ({ id: 3323 }),
  },
  {
    name: "Nested: results with their user",
    query: `{
  result(order_by: { createdAt: desc }, limit: 10) {
    id
    grade
    path
    user {
      id
      login
    }
  }
}`,
    variables: () => ({}),
  },
  {
    name: "Arguments + nested: XP of an event",
    query: XP_QUERY,
    variables: () => ({ userId: getUserIdFromToken(getToken()), eventId: 200 }),
  },
];

const SCHEMA_QUERY = `{
  __schema {
    queryType {
      fields {
        name
        description
        type { ...TypeRef }
      }
    }
    types {
      name
      kind
      fields {
        name
        type { ...TypeRef }
      }
    }
  }
}
fragment TypeRef on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name } } }
}`;

let initialised = false;
let onAuthError = () => {};

export function initGraphiql(options) {
  onAuthError = options.onAuthError;
  if (initialised) return;
  initialised = true;

  const select = $("gql-example");
  EXAMPLES.forEach((example, i) => select.add(new Option(example.name, String(i))));
  select.addEventListener("change", () => loadExample(Number(select.value)));
  loadExample(0);

  $("gql-run").addEventListener("click", run);
  for (const id of ["gql-query", "gql-variables"]) {
    $(id).addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        run();
      }
      // Keep Tab inside the editor as two spaces; Esc then Tab leaves it.
      if (event.key === "Tab" && !event.shiftKey && !event.currentTarget.dataset.escaped) {
        event.preventDefault();
        event.currentTarget.setRangeText("  ", event.currentTarget.selectionStart, event.currentTarget.selectionEnd, "end");
      }
      if (event.key === "Escape") event.currentTarget.dataset.escaped = "1";
      else if (event.key !== "Tab") delete event.currentTarget.dataset.escaped;
    });
  }

  $("gql-schema-load").addEventListener("click", loadSchema);
  $("gql-schema-filter").addEventListener("input", filterSchema);
}

function loadExample(index) {
  const example = EXAMPLES[index];
  $("gql-query").value = example.query;
  $("gql-variables").value = JSON.stringify(example.variables(), null, 2);
}

async function run() {
  const output = $("gql-output");
  const meta = $("gql-meta");
  const button = $("gql-run");

  let variables = {};
  const rawVariables = $("gql-variables").value.trim();
  if (rawVariables) {
    try {
      variables = JSON.parse(rawVariables);
    } catch (error) {
      output.textContent = `Variables are not valid JSON: ${error.message}`;
      output.classList.add("is-error");
      meta.textContent = "";
      return;
    }
  }

  button.disabled = true;
  meta.textContent = "Running…";
  const started = performance.now();
  try {
    const payload = await rawRequest($("gql-query").value, variables);
    output.textContent = JSON.stringify(payload, null, 2);
    output.classList.toggle("is-error", Boolean(payload.errors?.length));
    const rows = Object.values(payload.data ?? {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
    meta.textContent = `${Math.round(performance.now() - started)} ms · ${rows} row${rows === 1 ? "" : "s"}`;
  } catch (error) {
    if (error instanceof AuthError) return onAuthError(error);
    output.textContent = error.message;
    output.classList.add("is-error");
    meta.textContent = "";
  } finally {
    button.disabled = false;
  }
}

// "[transaction!]!" style names for an introspected type reference.
function typeName(ref) {
  if (!ref) return "";
  if (ref.kind === "NON_NULL") return `${typeName(ref.ofType)}!`;
  if (ref.kind === "LIST") return `[${typeName(ref.ofType)}]`;
  return ref.name;
}

function baseName(ref) {
  return ref?.name ?? baseName(ref?.ofType);
}

async function loadSchema() {
  const container = $("gql-schema");
  const button = $("gql-schema-load");
  button.disabled = true;
  container.replaceChildren(message("Loading schema…"));
  try {
    const payload = await rawRequest(SCHEMA_QUERY);
    if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
    const types = new Map(payload.data.__schema.types.map((t) => [t.name, t]));
    // Skip the generated _aggregate and _by_pk variants to keep the list short.
    const roots = payload.data.__schema.queryType.fields
      .filter((f) => !/_aggregate$|_by_pk$/.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    container.replaceChildren(...roots.map((field) => {
      const details = document.createElement("details");
      details.dataset.name = field.name;
      const summary = document.createElement("summary");
      summary.textContent = `${field.name}: ${typeName(field.type)}`;
      details.append(summary);
      details.addEventListener("toggle", () => {
        if (!details.open || details.querySelector("ul")) return;
        const type = types.get(baseName(field.type));
        const list = document.createElement("ul");
        for (const f of type?.fields ?? []) {
          const li = document.createElement("li");
          const code = document.createElement("code");
          code.textContent = f.name;
          li.append(code, `: ${typeName(f.type)}`);
          list.append(li);
        }
        details.append(list);
      });
      return details;
    }));
    $("gql-schema-filter").hidden = false;
    button.textContent = "Reload schema";
  } catch (error) {
    if (error instanceof AuthError) return onAuthError(error);
    container.replaceChildren(message(`Could not load the schema: ${error.message}`));
  } finally {
    button.disabled = false;
  }
}

function filterSchema(event) {
  const term = event.target.value.trim().toLowerCase();
  for (const details of $("gql-schema").querySelectorAll("details")) {
    details.hidden = term !== "" && !details.dataset.name.toLowerCase().includes(term);
  }
}

function message(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  return p;
}
