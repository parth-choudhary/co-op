// Matrix source: pulls room timeline events and converts them to RawTurn[].
// Uses the Synapse client API `/rooms/{id}/messages?dir=b` (newest-first paging).
//
// Tokens: we use the access token of an agent that's already in the room. Caller
// passes one in (typically the first triggered agent). If the token isn't valid
// for this room or the room isn't joined, we surface that as an empty fetch and
// let the caller proceed with no history rather than failing the whole run.

import { matrixFetch } from '../../matrix';
import type { RawTurn } from '../types';
import { HISTORY_CONFIG } from '../types';

interface MatrixRoomEvent {
  type: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content?: { msgtype?: string; body?: string };
}

/**
 * Fetch up to `limit` recent room messages, newest-first from the server, returned
 * to the caller in chronological order (oldest → newest). Only `m.room.message`
 * events with a `body` are returned; other event types (joins, reactions, etc.)
 * are filtered out.
 */
export async function fetchMatrixRoomTurns(opts: {
  matrixRoomId: string;
  accessToken: string;
  limit?: number;
}): Promise<RawTurn[]> {
  const limit = opts.limit ?? HISTORY_CONFIG.matrixFetchLimit;

  const params = new URLSearchParams({
    dir: 'b', // backwards from end of timeline
    limit: String(limit),
  });
  // Filter to message events server-side. The Matrix filter param is a JSON-encoded object.
  params.set('filter', JSON.stringify({ types: ['m.room.message'] }));

  let res: Response;
  try {
    res = await matrixFetch(
      `/_matrix/client/v3/rooms/${encodeURIComponent(opts.matrixRoomId)}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${opts.accessToken}` } },
    );
  } catch (err) {
    console.warn(`[matrixSource] fetch threw for room ${opts.matrixRoomId}:`, (err as any)?.message || err);
    return [];
  }
  if (!res.ok) {
    // 403 = not in room; 404 = room gone. Either way, no history is available — empty fetch.
    return [];
  }

  let body: { chunk?: MatrixRoomEvent[] };
  try {
    body = await res.json();
  } catch {
    return [];
  }
  const events = body.chunk ?? [];

  const turns: RawTurn[] = [];
  for (const ev of events) {
    if (ev.type !== 'm.room.message') continue;
    const text = ev.content?.body;
    if (!text || typeof text !== 'string') continue;
    turns.push({
      id: ev.event_id,
      timestamp: new Date(ev.origin_server_ts),
      sender: { matrixUserId: ev.sender },
      content: text,
    });
  }
  // Reverse to chronological order. The server paged backwards.
  turns.reverse();
  return turns;
}
