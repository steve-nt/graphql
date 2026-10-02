// Snapshots: everything the profile page draws, saved as one JSON file, so the
// page can still be shown after access to the platform API ends.

const FORMAT = "zone01-profile-snapshot";
const VERSION = 1;

// Path of the snapshot published with the site (commit it to the repo).
export const PUBLISHED_SNAPSHOT_URL = "data/snapshot.json";

// data: { user, level, eventId, xp, progress, skills, audits }
// stripPrivate removes the email and other students' logins, for a snapshot
// that will be published.
export function buildSnapshot(data, { stripPrivate }) {
  const clone = structuredClone(data);
  if (stripPrivate) {
    clone.user.email = null;
    for (const audit of clone.audits) {
      if (audit.group) audit.group.captainLogin = null;
    }
  }
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    private: !stripPrivate,
    ...clone,
  };
}

export function downloadSnapshot(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zone01-${snapshot.user.login}-${snapshot.savedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Checks a parsed JSON value and returns it as a snapshot, or throws.
export function parseSnapshot(value) {
  if (value?.format !== FORMAT || !value.user || !value.savedAt) {
    throw new Error("This file is not a profile snapshot.");
  }
  if (value.version > VERSION) {
    throw new Error("This snapshot was made by a newer version of the page.");
  }
  for (const key of ["xp", "progress", "skills", "audits"]) {
    if (!Array.isArray(value[key])) value[key] = [];
  }
  return value;
}

export async function readSnapshotFile(file) {
  let value;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  return parseSnapshot(value);
}

// The snapshot published with the site, or null if there is none.
export async function loadPublishedSnapshot() {
  try {
    const response = await fetch(PUBLISHED_SNAPSHOT_URL, { cache: "no-cache" });
    if (!response.ok) return null;
    return parseSnapshot(await response.json());
  } catch {
    return null;
  }
}
