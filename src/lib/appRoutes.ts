// Single source of truth for app URL paths. Tools embed `_url` from these
// helpers; harness sections embed inline URLs from these helpers; the
// CardKeyPill component links via these helpers; the canonical /c/[key] route
// builds redirects using these helpers.
//
// Add a new resource? Add the helper here, then thread it through the tool
// result that returns that resource. Don't sprinkle path strings.

/** Base origin to prepend when an absolute URL is needed (e.g. for matrix `formatted_body`).
 *  In-app links use relative paths, so most callers don't need this. */
export const APP_ORIGIN = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL || '';

export function pathForProject(projectId: string): string {
  return `/p/${projectId}`;
}

export function pathForBoard(projectId: string, boardId: string): string {
  return `/p/${projectId}/boards/${boardId}`;
}

/** Canonical path for a card by its key (e.g. "/p/foo/c/COOP-123").
 *  This is the URL that gets pasted in chat and detected as a pill.
 *  The page resolves the key and redirects to the board view with ?card=<id>. */
export function pathForCardKey(projectId: string, cardKey: string): string {
  return `/p/${projectId}/c/${cardKey}`;
}

/** Direct path that opens the card modal on its current board. Used internally
 *  for in-board navigation; NOT the URL we share. */
export function pathForCardOnBoard(projectId: string, boardId: string, cardId: string): string {
  return `/p/${projectId}/boards/${boardId}?card=${cardId}`;
}

export function pathForChat(projectId: string): string {
  return `/p/${projectId}/chat`;
}

export function pathForMembers(projectId: string): string {
  return `/p/${projectId}/members`;
}

export function pathForSettings(projectId: string, section?: string): string {
  return section ? `/p/${projectId}/settings/${section}` : `/p/${projectId}/settings`;
}

/** Absolute URL form for cases that need it (Matrix formatted_body, email, etc). */
export function absoluteUrl(path: string): string {
  if (!APP_ORIGIN) return path;
  return APP_ORIGIN.replace(/\/$/, '') + path;
}
