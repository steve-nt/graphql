import { SIGNIN_URL, TOKEN_KEY } from "./config.js";

// btoa only accepts Latin-1, so encode to UTF-8 bytes first.
function toBase64(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Sign in with "username:password" or "email:password" using Basic auth.
// Returns the JWT and stores it for later GraphQL requests.
export async function login(identifier, password) {
  const id = identifier.trim();
  if (!id || !password) throw new Error("Please enter your username or email and your password.");

  let response;
  try {
    response = await fetch(SIGNIN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${toBase64(`${id}:${password}`)}` },
    });
  } catch {
    throw new Error("Could not reach the sign-in server. Check your connection and try again.");
  }

  const body = await response.text();
  let data = body;
  try {
    data = JSON.parse(body);
  } catch {
    // Plain-text body, keep as is.
  }

  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) {
      throw new Error("Invalid username/email or password.");
    }
    throw new Error(`Sign-in failed (HTTP ${response.status}). Please try again later.`);
  }

  const token = typeof data === "string" ? data : data?.token;
  if (!token || !decodeJwt(token)) throw new Error("The server did not return a valid token.");

  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

// Returns the stored token, or null when missing or expired.
export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || (payload.exp && payload.exp * 1000 <= Date.now())) {
    logout();
    return null;
  }
  return token;
}

export function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// The authenticated user's id, read from the JWT claims.
export function getUserIdFromToken(token) {
  const payload = decodeJwt(token);
  const id = payload?.["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] ?? payload?.sub;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

// ── Remember me ───────────────────────────────────────────────────────
// The username or email is kept in localStorage. The password is never stored
// by this page: it is handed to the browser's password manager, which keeps
// it encrypted and offers it again next time.

const REMEMBER_KEY = "zone01_remember_login";

export function getRememberedLogin() {
  try {
    return localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

export async function rememberLogin(identifier, password) {
  try {
    localStorage.setItem(REMEMBER_KEY, identifier.trim());
  } catch {
    // Storage blocked; nothing to remember.
  }
  // Chrome and Edge: save to the password manager directly. Other browsers
  // offer to save it themselves because of the form's autocomplete attributes.
  if ("PasswordCredential" in window && navigator.credentials) {
    try {
      await navigator.credentials.store(new window.PasswordCredential({ id: identifier.trim(), password }));
    } catch {
      // The user declined, or the browser does not allow it here.
    }
  }
}

export function forgetLogin() {
  try {
    localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Nothing stored.
  }
}

// A password saved in the browser for this site, without prompting.
// Only Chrome and Edge support this; elsewhere the browser's autofill fills
// the field instead.
export async function getSavedPassword() {
  if (!("PasswordCredential" in window) || !navigator.credentials) return null;
  try {
    const credential = await navigator.credentials.get({ password: true, mediation: "silent" });
    return credential?.type === "password" ? credential : null;
  } catch {
    return null;
  }
}
