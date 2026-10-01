import { GRAPHQL_URL } from "./config.js";
import { getToken } from "./auth.js";

// Raised when the token is missing, expired or rejected, so the app can log out.
export class AuthError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "AuthError";
  }
}

// Send a query with the JWT as a Bearer token. Returns the raw GraphQL payload
// ({ data, errors }) so the GraphiQL page can show errors as the server sent them.
export async function rawRequest(query, variables = {}) {
  const token = getToken();
  if (!token) throw new AuthError("You are not signed in.");

  let response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("Could not reach the GraphQL server.");
  }

  if (response.status === 401 || response.status === 403) throw new AuthError();

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The GraphQL server returned an invalid response (HTTP ${response.status}).`);
  }

  const messages = (payload.errors ?? []).map((e) => e.message ?? "Unknown error");
  if (messages.some((m) => /JWTExpired|invalid-jwt|jwt|Could not verify/i.test(m))) throw new AuthError();
  return payload;
}

// Like rawRequest, but throws on GraphQL errors and returns only `data`.
export async function request(query, variables = {}) {
  const payload = await rawRequest(query, variables);
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
  return payload.data;
}

// ── Queries ─────────────────────────────────────────────────────────

// Normal query: no arguments, the API returns only the signed-in user.
export const USER_QUERY = `{
  user {
    id
    login
    firstName
    lastName
    email
    campus
    createdAt
    auditRatio
    totalUp
    totalDown
  }
}`;

// Query with arguments: highest level transaction, used to find the main
// curriculum event (div-01) and the current level.
export const LEVEL_QUERY = `query Level($userId: Int!) {
  transaction(
    where: { userId: { _eq: $userId }, type: { _eq: "level" } }
    order_by: { amount: desc }
  ) {
    amount
    eventId
    path
  }
}`;

// Arguments + nested: XP transactions of one event with the object they came from.
export const XP_QUERY = `query Xp($userId: Int!, $eventId: Int!) {
  transaction(
    where: {
      userId: { _eq: $userId }
      eventId: { _eq: $eventId }
      type: { _eq: "xp" }
    }
    order_by: [{ createdAt: asc }, { id: asc }]
  ) {
    id
    amount
    createdAt
    path
    object {
      name
      type
    }
  }
}`;

// Arguments + nested: finished project attempts with their grade.
export const PROGRESS_QUERY = `query Projects($userId: Int!, $eventId: Int!) {
  progress(
    where: {
      userId: { _eq: $userId }
      eventId: { _eq: $eventId }
      isDone: { _eq: true }
      object: { type: { _eq: "project" } }
    }
    order_by: { updatedAt: desc }
  ) {
    id
    grade
    updatedAt
    path
    object {
      name
    }
  }
}`;

// Arguments: skill transactions (type skill_go, skill_js, ...).
export const SKILLS_QUERY = `query Skills($userId: Int!) {
  transaction(
    where: { userId: { _eq: $userId }, type: { _like: "skill_%" } }
    order_by: { amount: desc }
  ) {
    type
    amount
  }
}`;

// Arguments + nested: audits the user did for other groups.
export const AUDITS_QUERY = `query Audits($userId: Int!) {
  audit(
    where: { auditorId: { _eq: $userId }, grade: { _is_null: false } }
    order_by: { createdAt: desc }
  ) {
    id
    grade
    createdAt
    group {
      path
      captainLogin
    }
  }
}`;

