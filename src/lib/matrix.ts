// Server-side Matrix admin utilities
// Communicates with the Synapse homeserver via its admin API

const MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN || '';

export async function matrixFetch(path: string, options: RequestInit = {}) {
  const url = `${MATRIX_HOMESERVER}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(MATRIX_ADMIN_TOKEN ? { Authorization: `Bearer ${MATRIX_ADMIN_TOKEN}` } : {}),
      ...options.headers,
    },
  });
  return res;
}

/**
 * Register a new Matrix user via Synapse admin API
 */
export async function registerMatrixUser(localpart: string, displayName: string, password: string) {
  const res = await matrixFetch(`/_synapse/admin/v2/users/@${localpart}:coop.local`, {
    method: 'PUT',
    body: JSON.stringify({
      displayname: displayName,
      password,
      admin: false,
      deactivated: false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to register Matrix user: ${err.error || res.statusText}`);
  }
  return res.json();
}

/**
 * Login as a Matrix user and get an access token
 */
export async function loginMatrixUser(localpart: string, password: string) {
  const res = await matrixFetch('/_matrix/client/v3/login', {
    method: 'POST',
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: localpart },
      password,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to login Matrix user: ${err.error || res.statusText}`);
  }
  return res.json();
}

/**
 * Create a Matrix room
 */
export async function createMatrixRoom(name: string, topic?: string, inviteUserIds?: string[]) {
  const res = await matrixFetch('/_matrix/client/v3/createRoom', {
    method: 'POST',
    body: JSON.stringify({
      name,
      topic: topic || '',
      preset: 'public_chat',
      invite: inviteUserIds || [],
      creation_content: { 'm.federate': false },
      initial_state: [
        { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to create Matrix room: ${err.error || res.statusText}`);
  }
  return res.json();
}

/**
 * List joined rooms for a user
 */
export async function getJoinedRooms(accessToken: string) {
  const res = await matrixFetch('/_matrix/client/v3/joined_rooms', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { joined_rooms: [] };
  return res.json();
}

/**
 * Get room info
 */
export async function getRoomState(roomId: string, accessToken: string) {
  const res = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * Send a message to a room. The `body` is treated as markdown — we always also send
 * a sanitized HTML rendering as Matrix's `formatted_body` so clients that understand
 * formatting (ours, Element, etc.) display it nicely. The raw markdown stays in
 * `body` for plain-text fallbacks (notifications, search indexes, history fed back
 * into LLMs).
 *
 * Pass `format: 'plain'` to opt out (used for system-style notices that shouldn't be
 * markdown-parsed, e.g. the "agent run failed" diagnostic).
 */
export async function sendMessage(
  roomId: string,
  accessToken: string,
  body: string,
  msgtype: string = 'm.text',
  opts?: { format?: 'markdown' | 'plain' },
) {
  const format = opts?.format ?? 'markdown';
  const txnId = `m${Date.now()}`;

  let payload: Record<string, unknown> = { msgtype, body };
  if (format === 'markdown') {
    const { renderToMatrixHtml } = await import('./chat/markdown');
    const html = renderToMatrixHtml(body);
    // Only attach formatted_body if rendering produced something meaningfully different
    // from the plain text — saves a few bytes for one-line replies with no formatting.
    if (html && html !== `<p>${escapeHtml(body)}</p>`) {
      payload = { ...payload, format: 'org.matrix.custom.html', formatted_body: html };
    }
  }

  const res = await matrixFetch(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to send message: ${err.error || res.statusText}`);
  }
  return res.json();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/**
 * Send a reaction (Matrix `m.reaction` event) to an existing message. Multiple
 * users can react with the same key; clients aggregate by `event_id + key`.
 * Returns the reaction event id — needed if the caller wants to redact later.
 */
export async function sendReaction(
  roomId: string,
  accessToken: string,
  targetEventId: string,
  key: string,
): Promise<{ event_id: string }> {
  const txnId = `r${Date.now()}`;
  const res = await matrixFetch(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        'm.relates_to': {
          rel_type: 'm.annotation',
          event_id: targetEventId,
          key,
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to send reaction: ${err.error || res.statusText}`);
  }
  return res.json();
}

/**
 * Redact (delete) any event the caller owns. Used to undo a reaction.
 */
export async function redactEvent(
  roomId: string,
  accessToken: string,
  eventId: string,
  reason?: string,
): Promise<void> {
  const txnId = `x${Date.now()}`;
  const res = await matrixFetch(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to redact event: ${err.error || res.statusText}`);
  }
}

/**
 * Send a reply that quotes another message. Per Matrix spec we attach the
 * `m.in_reply_to` relation AND embed a fallback quote in `body` / `formatted_body`
 * so older clients still display the parent inline. Markdown in `body` still
 * renders.
 *
 * `parent` carries just enough info to build the fallback quote without a fetch.
 */
export async function sendReply(
  roomId: string,
  accessToken: string,
  body: string,
  parent: { eventId: string; sender: string; body: string },
): Promise<{ event_id: string }> {
  const { renderToMatrixHtml } = await import('./chat/markdown');

  // Plain-text fallback quote: each line of the parent body is prefixed with "> ".
  const quotedLines = parent.body.split('\n').map((l) => `> ${l}`).join('\n');
  const fallbackBody = `> <${parent.sender}> ${quotedLines.replace(/^> /, '')}\n\n${body}`;

  // Rich-text fallback per spec: <mx-reply><blockquote>... <a href="matrix:..."
  // points at the parent. The reply HTML is appended below.
  const replyHtml = renderToMatrixHtml(body);
  const safeParentBody = escapeHtml(parent.body).replace(/\n/g, '<br/>');
  const formattedBody = `<mx-reply><blockquote><a href="https://matrix.to/#/${encodeURIComponent(roomId)}/${encodeURIComponent(parent.eventId)}">In reply to</a> <a href="https://matrix.to/#/${encodeURIComponent(parent.sender)}">${escapeHtml(parent.sender)}</a><br/>${safeParentBody}</blockquote></mx-reply>${replyHtml || `<p>${escapeHtml(body)}</p>`}`;

  const txnId = `m${Date.now()}`;
  const res = await matrixFetch(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: fallbackBody,
        format: 'org.matrix.custom.html',
        formatted_body: formattedBody,
        'm.relates_to': {
          'm.in_reply_to': { event_id: parent.eventId },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to send reply: ${err.error || res.statusText}`);
  }
  return res.json();
}

/**
 * Send typing notification on behalf of a user/agent. `timeout` is how long the server keeps
 * the typing state active if we don't extend/clear it.
 */
export async function setTyping(roomId: string, userId: string, accessToken: string, typing: boolean, timeout = 20000) {
  try {
    await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(typing ? { typing: true, timeout } : { typing: false }),
    });
  } catch { /* best-effort */ }
}

/**
 * Upload media to Matrix content repository
 */
export async function uploadMedia(accessToken: string, data: Blob | ArrayBuffer, filename: string, contentType: string) {
  const res = await fetch(`${MATRIX_HOMESERVER}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: data,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to upload media: ${err.error || res.statusText}`);
  }
  return res.json(); // { content_uri: "mxc://..." }
}

/**
 * Convert an mxc:// URL to an HTTP URL for displaying
 */
export function mxcToHttp(mxcUrl: string): string {
  if (!mxcUrl.startsWith('mxc://')) return mxcUrl;
  const parts = mxcUrl.replace('mxc://', '').split('/');
  const serverName = parts[0];
  const mediaId = parts[1];
  return `${MATRIX_HOMESERVER}/_matrix/media/v3/download/${serverName}/${mediaId}`;
}

/**
 * Generate a Matrix user password from a deterministic seed
 * (In production, use a proper key derivation)
 */
export function generateMatrixPassword(userId: string): string {
  return `coop_matrix_${userId}_${process.env.NEXTAUTH_SECRET?.slice(0, 8) || 'secret'}`;
}

export function matrixLocalpartFromAgentId(agentId: string): string {
  return `agent-${agentId.toLowerCase().slice(0, 20)}`;
}

export function matrixUserIdFor(localpart: string): string {
  return `@${localpart}:coop.local`;
}

/**
 * Join a Matrix room using a specific user's access token (self-join).
 * If the room is invite-only and the user hasn't been invited, this will fail.
 */
export async function joinRoomAs(roomId: string, accessToken: string) {
  const res = await matrixFetch(`/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({}),
  });
  return res.ok;
}

/**
 * Admin-invite a user to a room. Requires the sender token to have power to invite.
 */
export async function inviteUserToRoom(roomId: string, userId: string, senderToken: string) {
  const res = await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${senderToken}` },
    body: JSON.stringify({ user_id: userId }),
  });
  return res.ok;
}
