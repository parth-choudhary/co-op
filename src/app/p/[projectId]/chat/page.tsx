'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  MessageSquare, Hash, Plus, Send, Paperclip,
  Search, FileText, X, Loader2, AtSign, ArrowDown, Trash2,
  Smile, Reply,
} from 'lucide-react';
import { renderToMatrixHtml, sanitizeIncomingHtml, looksLikeMarkdown } from '@/lib/chat/markdown';
import { emojifyShortcodes } from '@/lib/chat/emoji';
import ChatMessageContent from '@/components/ChatMessageContent';
import RichComposer, { type RichComposerHandle } from '@/components/editor/RichComposer';
import { useCardHydrator } from '@/components/editor/useCardHydrator';
import type { MentionItem } from '@/components/editor/MentionList';
import EmojiPicker from '@/components/chat/EmojiPicker';
import MessageContextMenu from '@/components/chat/MessageContextMenu';

interface RoomInfo {
  id: string; name: string; color?: string;
  type: 'project' | 'channel' | 'dm';
  matrixRoomId: string | null;
  unread?: number;
  counterpart?: { kind: 'user' | 'agent'; id: string; name: string; avatarUrl?: string | null } | null;
}
type ChatMsgType = 'text' | 'notice' | 'emote' | 'image' | 'file' | 'video' | 'audio';
interface ChatMessage {
  id: string; sender: string; senderName: string;
  /** Raw body — markdown for text/notice/emote, filename for media. */
  content: string;
  /** Sanitized HTML from Matrix `formatted_body`, when present. */
  formattedHtml?: string | null;
  timestamp: number;
  type: ChatMsgType;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** event_id this message is a reply to, if any. */
  inReplyTo?: string | null;
}

interface RawReaction {
  /** event_id of the reaction event itself — needed to redact when toggling off. */
  eventId: string;
  /** Matrix user id of who reacted. */
  sender: string;
  /** The emoji (or any string key) the reactor chose. */
  key: string;
}
interface AggregatedReaction {
  key: string;
  count: number;
  /** True if the current user is among the reactors. */
  mine: boolean;
}

// Wrap @mention tokens (e.g. "@CMO") in a span. Operates on an already-sanitized
// HTML string, scanning text content only — never inside tags or attributes — so
// links containing "@" (mailto:, matrix:) aren't mangled.
function highlightMentionsInHtml(html: string): string {
  let out = '';
  let buf = '';
  let inTag = false;
  const flush = () => {
    out += buf.replace(/(@\w+)/g, '<span class="mention">$1</span>');
    buf = '';
  };
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<') { flush(); inTag = true; out += ch; }
    else if (ch === '>') { inTag = false; out += ch; }
    else if (inTag) { out += ch; }
    else { buf += ch; }
  }
  flush();
  return out;
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Pick the right Matrix msgtype for a file based on its mime type.
function msgtypeForFile(mime: string): 'm.image' | 'm.video' | 'm.audio' | 'm.file' {
  if (mime.startsWith('image/')) return 'm.image';
  if (mime.startsWith('video/')) return 'm.video';
  if (mime.startsWith('audio/')) return 'm.audio';
  return 'm.file';
}

// When a message is a reply, Matrix encodes the parent quote inside the body
// (lines starting with "> ") and inside formatted_body (`<mx-reply>...`). Strip
// both so the actual reply text is what we render — the parent is shown
// separately above the message body.
function stripReplyFallback(body: string): string {
  // The convention is: zero or more "> "-prefixed lines, then a blank line,
  // then the real message. If we don't find a blank line, leave the body alone.
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('> ')) i++;
  if (i === 0) return body;
  if (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}
function stripMxReply(html: string): string {
  return html.replace(/^\s*<mx-reply>[\s\S]*?<\/mx-reply>/i, '').trim();
}

// Convert a single Matrix m.room.message event → our ChatMessage shape.
function eventToChatMessage(e: any, resolveSenderName: (s: string) => string): ChatMessage {
  const mt = e.content?.msgtype;
  const type: ChatMsgType =
    mt === 'm.image' ? 'image'
    : mt === 'm.file' ? 'file'
    : mt === 'm.video' ? 'video'
    : mt === 'm.audio' ? 'audio'
    : mt === 'm.notice' ? 'notice'
    : mt === 'm.emote' ? 'emote'
    : 'text';
  let content = e.content?.body || '';
  let formattedHtml: string | null = e.content?.format === 'org.matrix.custom.html'
    ? (e.content?.formatted_body ?? null)
    : null;

  const inReplyTo = e.content?.['m.relates_to']?.['m.in_reply_to']?.event_id ?? null;
  if (inReplyTo) {
    content = stripReplyFallback(content);
    if (formattedHtml) formattedHtml = stripMxReply(formattedHtml);
  }

  return {
    id: e.event_id,
    sender: e.sender,
    senderName: resolveSenderName(e.sender),
    content,
    formattedHtml,
    timestamp: e.origin_server_ts,
    type,
    mediaUrl: e.content?.url,
    fileName: e.content?.body,
    fileSize: e.content?.info?.size,
    mimeType: e.content?.info?.mimetype,
    inReplyTo,
  };
}

// Walk a Matrix events chunk and pull out reactions, indexed by the event they
// target. Caller is responsible for filtering messages out of the same chunk.
function eventsToReactions(events: any[]): Record<string, RawReaction[]> {
  const out: Record<string, RawReaction[]> = {};
  for (const e of events) {
    if (e.type !== 'm.reaction') continue;
    const rel = e.content?.['m.relates_to'];
    if (rel?.rel_type !== 'm.annotation') continue;
    const target = rel.event_id;
    const key = rel.key;
    if (!target || !key) continue;
    (out[target] ||= []).push({ eventId: e.event_id, sender: e.sender, key });
  }
  return out;
}

// Group reactions for a single message by emoji and tag whether the current user
// is among the reactors. Order: highest count first, then alphabetical.
function aggregateReactions(raws: RawReaction[] | undefined, myMatrixId: string | null): AggregatedReaction[] {
  if (!raws || raws.length === 0) return [];
  const buckets = new Map<string, { count: number; mine: boolean }>();
  for (const r of raws) {
    const b = buckets.get(r.key) ?? { count: 0, mine: false };
    b.count += 1;
    if (myMatrixId && r.sender === myMatrixId) b.mine = true;
    buckets.set(r.key, b);
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => ({ key, count: b.count, mine: b.mine }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
interface TeamMember {
  id: string; name: string; avatarUrl?: string | null;
  matrixUserId?: string | null; type: 'user' | 'agent';
}

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
const formatMsgTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const isSameDay = (a: number, b: number) => {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};
const formatDateSep = (ts: number) => {
  const d = new Date(ts), today = new Date();
  if (isSameDay(ts, today.getTime())) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isSameDay(ts, yesterday.getTime())) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

export default function ProjectChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';

  const [matrixState, setMatrixState] = useState<{
    accessToken: string | null; userId: string | null; homeserver: string | null; connected: boolean; error: string | null;
  }>({ accessToken: null, userId: null, homeserver: null, connected: false, error: null });

  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const composerRef = useRef<RichComposerHandle>(null);
  const hydrateCardKeys = useCardHydrator(projectId);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const mentionSuggestions = useCallback((query: string): MentionItem[] => {
    const q = query.toLowerCase();
    return team
      .filter((m) => m.name.toLowerCase().includes(q))
      .map((m) => ({ id: m.id, label: m.name, kind: m.type }));
  }, [team]);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmPickerQuery, setDmPickerQuery] = useState('');
  const [creatingDm, setCreatingDm] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  // typingByRoom[roomId] = array of user/agent Matrix IDs currently typing (excluding self)
  const [typingByRoom, setTypingByRoom] = useState<Record<string, string[]>>({});
  const typingSyncSince = useRef<string | null>(null);
  const typingSentAt = useRef<number>(0);

  // Reactions for the active room, keyed by the event_id they target.
  const [reactionsByEvent, setReactionsByEvent] = useState<Record<string, RawReaction[]>>({});
  // Right-click context menu state. `msg` is the message that was clicked on.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: ChatMessage } | null>(null);
  // When set, the next send becomes a reply to this message.
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  // Composer-bound emoji picker visibility.
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSeenRef = useRef<Record<string, number>>({});
  const prevMsgCountRef = useRef<Record<string, number>>({});

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(setNotifPermission);
      }
    }
    // Load last-seen timestamps from localStorage
    try {
      const saved = localStorage.getItem(`chat-lastseen-${projectId}`);
      if (saved) lastSeenRef.current = JSON.parse(saved);
    } catch {}
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  useEffect(() => { initChat(); }, []);

  // Persist unread state to localStorage for sidebar badge
  const persistUnread = useCallback((roomList: RoomInfo[]) => {
    const totalUnread = roomList.reduce((sum, r) => sum + (r.unread || 0), 0);
    try {
      localStorage.setItem(`chat-unread-${projectId}`, String(totalUnread));
      // Dispatch a storage event so the sidebar can react
      window.dispatchEvent(new StorageEvent('storage', { key: `chat-unread-${projectId}`, newValue: String(totalUnread) }));
    } catch {}
  }, [projectId]);

  // Show browser notification
  const showNotification = useCallback((roomName: string, senderName: string, content: string) => {
    if (notifPermission !== 'granted') return;
    if (document.hasFocus()) return; // Don't notify if tab is focused
    try {
      const notif = new Notification(`#${roomName}`, {
        body: `${senderName}: ${content}`,
        icon: '/favicon.ico',
        tag: `chat-${projectId}`,
        silent: false,
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), 5000);
    } catch {}
  }, [notifPermission, projectId]);

  const initChat = async () => {
    try {
      const roomsRes = await fetch(`/api/chat/rooms?projectId=${projectId}`).then(r => r.ok ? r.json() : { project: null, channels: [], users: [], agents: [] }).catch(() => ({ project: null, channels: [], users: [], agents: [] }));

      const projectRoom: RoomInfo[] = roomsRes.project ? [{
        id: roomsRes.project.id, name: roomsRes.project.name, color: roomsRes.project.color,
        type: 'project' as const, matrixRoomId: roomsRes.project.matrixRoomId, unread: 0,
      }] : [];
      const channelRooms: RoomInfo[] = (roomsRes.channels || []).map((c: any) => ({
        id: c.id, name: c.name, type: 'channel' as const, matrixRoomId: c.matrixRoomId, unread: 0,
      }));
      const dmRooms: RoomInfo[] = (roomsRes.dms || []).map((c: any) => ({
        id: c.id, name: c.counterpart?.name || c.name, type: 'dm' as const,
        matrixRoomId: c.matrixRoomId, unread: 0, counterpart: c.counterpart || null,
      }));
      const allRooms = [...projectRoom, ...channelRooms, ...dmRooms];
      setRooms(allRooms);

      const teamMembers: TeamMember[] = [
        ...(roomsRes.users || []).map((u: any) => ({ ...u, type: 'user' as const })),
        ...(roomsRes.agents || []).map((a: any) => ({ ...a, type: 'agent' as const })),
      ];
      setTeam(teamMembers);

      if (allRooms.length > 0) setActiveRoomId(allRooms[0].id);

      try {
        const tokenRes = await fetch('/api/chat/token');
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          setMatrixState({ accessToken: tokenData.accessToken, userId: tokenData.userId, homeserver: tokenData.homeserver, connected: true, error: null });
        } else {
          const err = await tokenRes.json().catch(() => ({}));
          setMatrixState(prev => ({ ...prev, error: err.error || 'Matrix server unavailable', connected: false }));
        }
      } catch {
        setMatrixState(prev => ({ ...prev, error: 'Matrix server not running.', connected: false }));
      }
      setLoading(false);
    } catch {
      setMatrixState(prev => ({ ...prev, error: 'Failed to load chat data', connected: false }));
      setLoading(false);
    }
  };

  // Auto-join a Matrix room (idempotent — no-op if already joined)
  const joinRoom = async (roomId: string) => {
    if (!matrixState.accessToken || !matrixState.homeserver) return;
    try {
      await fetch(`${matrixState.homeserver}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch { }
  };

  // Mark room as read when switching to it
  const markRoomRead = useCallback((roomId: string) => {
    lastSeenRef.current[roomId] = Date.now();
    try { localStorage.setItem(`chat-lastseen-${projectId}`, JSON.stringify(lastSeenRef.current)); } catch {}
    setRooms(prev => {
      const updated = prev.map(r => r.id === roomId ? { ...r, unread: 0 } : r);
      persistUnread(updated);
      return updated;
    });
  }, [projectId, persistUnread]);

  useEffect(() => {
    if (!activeRoomId || !matrixState.connected) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (!room?.matrixRoomId || !matrixState.accessToken) { setMessages([]); return; }
    // Mark as read and join the room first, then fetch messages
    markRoomRead(activeRoomId);
    joinRoom(room.matrixRoomId).then(() => fetchMessages(room.matrixRoomId!));
    if (pollInterval) clearInterval(pollInterval);
    // Poll all rooms for unread tracking
    const interval = setInterval(() => {
      rooms.forEach(r => {
        if (r.matrixRoomId) pollRoomForUnread(r);
      });
    }, 5000);
    setPollInterval(interval);
    return () => clearInterval(interval);
  }, [activeRoomId, matrixState.connected]);

  // Poll Matrix /sync for typing EDUs (separate from message polling — typing is ephemeral)
  useEffect(() => {
    if (!matrixState.connected || !matrixState.accessToken || !matrixState.homeserver) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const qs = new URLSearchParams({
          timeout: '0',
          filter: JSON.stringify({ room: { timeline: { limit: 0 }, state: { limit: 0 } } }),
        });
        if (typingSyncSince.current) qs.set('since', typingSyncSince.current);
        const res = await fetch(`${matrixState.homeserver}/_matrix/client/v3/sync?${qs}`, {
          headers: { Authorization: `Bearer ${matrixState.accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        typingSyncSince.current = data.next_batch || typingSyncSince.current;
        const joined = data.rooms?.join || {};
        const updates: Record<string, string[]> = {};
        for (const matrixRoomId of Object.keys(joined)) {
          const events = joined[matrixRoomId].ephemeral?.events || [];
          const typingEvt = events.find((e: any) => e.type === 'm.typing');
          if (!typingEvt) continue;
          const ids = (typingEvt.content?.user_ids || []).filter((id: string) => id !== matrixState.userId);
          const room = rooms.find(r => r.matrixRoomId === matrixRoomId);
          if (room) updates[room.id] = ids;
        }
        if (!cancelled && Object.keys(updates).length > 0) {
          setTypingByRoom(prev => ({ ...prev, ...updates }));
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(tick, 2000);
    tick();
    return () => { cancelled = true; clearInterval(interval); };
  }, [matrixState.connected, matrixState.accessToken, matrixState.homeserver, matrixState.userId, rooms]);

  // Send "I'm typing" to Matrix when user is editing the input (throttled)
  const notifyTyping = async (isTyping: boolean) => {
    if (!matrixState.accessToken || !matrixState.homeserver || !matrixState.userId || !activeRoomId) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (!room?.matrixRoomId) return;
    const now = Date.now();
    // Throttle: send typing=true at most every 8s; always allow typing=false
    if (isTyping && now - typingSentAt.current < 8000) return;
    typingSentAt.current = isTyping ? now : 0;
    try {
      await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/typing/${encodeURIComponent(matrixState.userId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(isTyping ? { typing: true, timeout: 15000 } : { typing: false }),
      });
    } catch { /* best-effort */ }
  };

  // Poll a single room for unread messages
  const pollRoomForUnread = async (room: RoomInfo) => {
    if (!matrixState.accessToken || !matrixState.homeserver || !room.matrixRoomId) return;
    try {
      const res = await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/messages?dir=b&limit=50`, { headers: { Authorization: `Bearer ${matrixState.accessToken}` } });
      if (!res.ok) return;
      const data = await res.json();
      const chunk = data.chunk || [];
      const allMsgs = chunk.filter((e: any) => e.type === 'm.room.message');

      // If this is the active room, update messages AND keep lastSeen current so it doesn't
      // reappear as unread when the user switches away.
      if (room.id === activeRoomId) {
        const msgs: ChatMessage[] = allMsgs.map((e: any) => eventToChatMessage(e, resolveSenderName)).reverse();
        setMessages(msgs);
        setReactionsByEvent(eventsToReactions(chunk));
        if (!document.hidden) {
          const latestTs = allMsgs.reduce((max: number, e: any) => Math.max(max, e.origin_server_ts || 0), Date.now());
          lastSeenRef.current[room.id] = latestTs;
          try { localStorage.setItem(`chat-lastseen-${projectId}`, JSON.stringify(lastSeenRef.current)); } catch {}
          if ((rooms.find(r => r.id === room.id)?.unread || 0) !== 0) {
            setRooms(prev => {
              const updated = prev.map(r => r.id === room.id ? { ...r, unread: 0 } : r);
              persistUnread(updated);
              return updated;
            });
          }
        }
        return;
      }

      // For non-active (or active-while-hidden) rooms, compute unread since last seen
      const lastSeen = lastSeenRef.current[room.id] || 0;
      const newMsgs = allMsgs.filter((e: any) => e.origin_server_ts > lastSeen && e.sender !== matrixState.userId);

      if (newMsgs.length > 0) {
        // Fire notification only for messages with ts newer than the highest ts we've already notified
        const lastNotifiedTs = prevMsgCountRef.current[room.id] || 0;
        const fresh = newMsgs.filter((e: any) => e.origin_server_ts > lastNotifiedTs);
        if (fresh.length > 0 && lastNotifiedTs > 0) {
          const latest = fresh[0];
          showNotification(room.name, resolveSenderName(latest.sender), latest.content?.body || '');
        }
        // Always update watermark so we never re-notify for the same message (even on first poll)
        prevMsgCountRef.current[room.id] = Math.max(
          prevMsgCountRef.current[room.id] || 0,
          ...newMsgs.map((e: any) => e.origin_server_ts || 0),
        );

        setRooms(prev => {
          const updated = prev.map(r => r.id === room.id ? { ...r, unread: newMsgs.length } : r);
          persistUnread(updated);
          return updated;
        });
      }
    } catch {}
  };

  // Resolve Matrix sender ID to display name
  const resolveSenderName = (sender: string): string => {
    // Match by full matrix user id first (handles agents: @agent-xxx:coop.local)
    const byMatrix = team.find(m => (m as any).matrixUserId === sender);
    if (byMatrix) return byMatrix.name;
    // sender format: @coop_<userId>:coop.local
    const userId = sender?.split(':')[0]?.replace('@coop_', '');
    const member = team.find(m => m.id === userId);
    if (member) return member.name;
    // Check if it's the admin user
    if (sender?.includes('admin')) return 'Admin';
    return userId || sender;
  };

  const fetchMessages = async (roomId: string) => {
    if (!matrixState.accessToken || !matrixState.homeserver) return;
    try {
      const res = await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`, { headers: { Authorization: `Bearer ${matrixState.accessToken}` } });
      if (!res.ok) {
        // If forbidden, try joining first then retry
        if (res.status === 403) {
          await joinRoom(roomId);
          const retry = await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`, { headers: { Authorization: `Bearer ${matrixState.accessToken}` } });
          if (!retry.ok) return;
          const data = await retry.json();
          const chunk = data.chunk || [];
          const msgs: ChatMessage[] = chunk
            .filter((e: any) => e.type === 'm.room.message')
            .map((e: any) => eventToChatMessage(e, resolveSenderName))
            .reverse();
          setMessages(msgs);
          setReactionsByEvent(eventsToReactions(chunk));
          return;
        }
        return;
      }
      const data = await res.json();
      const chunk = data.chunk || [];
      const msgs: ChatMessage[] = chunk
        .filter((e: any) => e.type === 'm.room.message')
        .map((e: any) => eventToChatMessage(e, resolveSenderName))
        .reverse();
      setMessages(msgs);
      setReactionsByEvent(eventsToReactions(chunk));
    } catch { }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !activeRoomId || !matrixState.accessToken || !matrixState.homeserver) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (!room?.matrixRoomId) return;
    setSending(true);
    const txnId = `m${Date.now()}`;
    try {
      // Ensure we're joined before sending
      await joinRoom(room.matrixRoomId);

      // Expand `:fire:` style shortcodes before anything else looks at the body.
      // We do this on send rather than on keystroke so the user can still type
      // and edit the literal text if they want.
      const expanded = emojifyShortcodes(inputValue);

      // Render markdown → HTML for `formatted_body` so other clients display it formatted.
      // Only attach formatted_body if the body actually has markdown to render — saves
      // bytes for the common one-line plain-text case.
      let matrixPayload: Record<string, unknown> = { msgtype: 'm.text', body: expanded };
      if (looksLikeMarkdown(expanded)) {
        const html = renderToMatrixHtml(expanded);
        if (html) {
          matrixPayload.format = 'org.matrix.custom.html';
          matrixPayload.formatted_body = html;
        }
      }

      // If we're replying, decorate the payload per Matrix spec: in_reply_to relation,
      // plus a fallback `> <user> body` quote prefix and `<mx-reply>` HTML wrapper for
      // clients that don't natively render the relation.
      if (replyingTo) {
        const parentBody = (replyingTo.content || '').split('\n').map((l) => `> ${l}`).join('\n');
        const fallbackBody = `> <${replyingTo.sender}> ${parentBody.replace(/^> /, '')}\n\n${expanded}`;
        const replyHtml = (matrixPayload.formatted_body as string | undefined)
          ?? `<p>${escapeText(expanded).replace(/\n/g, '<br/>')}</p>`;
        const safeParentBody = escapeText(replyingTo.content || '').replace(/\n/g, '<br/>');
        const formattedBody = `<mx-reply><blockquote><a href="https://matrix.to/#/${encodeURIComponent(room.matrixRoomId)}/${encodeURIComponent(replyingTo.id)}">In reply to</a> <a href="https://matrix.to/#/${encodeURIComponent(replyingTo.sender)}">${escapeText(replyingTo.sender)}</a><br/>${safeParentBody}</blockquote></mx-reply>${replyHtml}`;
        matrixPayload = {
          ...matrixPayload,
          body: fallbackBody,
          format: 'org.matrix.custom.html',
          formatted_body: formattedBody,
          'm.relates_to': { 'm.in_reply_to': { event_id: replyingTo.id } },
        };
      }

      const res = await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/send/m.room.message/${txnId}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(matrixPayload),
      });
      if (res.ok) {
        const sentContent = expanded;
        setInputValue('');
        composerRef.current?.clear();
        setReplyingTo(null);
        notifyTyping(false);
        setTimeout(() => fetchMessages(room.matrixRoomId!), 300);
        // Notify server: log to agent activity, trigger mentions. Agents reply as themselves server-side.
        fetch('/api/chat/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: room.id,
            matrixRoomId: room.matrixRoomId,
            content: sentContent,
            roomName: room.name,
            inviterToken: matrixState.accessToken,
          }),
        }).then(r => r.ok ? r.json() : null).then((result) => {
          if (result?.replies?.some((r: any) => r.posted)) {
            setTimeout(() => fetchMessages(room.matrixRoomId!), 500);
          }
        }).catch(() => {});
      }
    } catch { }
    setSending(false);
    inputRef.current?.focus();
  };

  // Toggle a reaction on a message. If the current user already reacted with the
  // same emoji, redact our reaction event; otherwise send a new one. Optimistically
  // updates local state, then re-fetches so the timeline catches up.
  const handleToggleReaction = async (msg: ChatMessage, key: string) => {
    if (!matrixState.accessToken || !matrixState.homeserver || !matrixState.userId || !activeRoomId) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (!room?.matrixRoomId) return;
    const myMatrix = matrixState.userId;
    const existing = (reactionsByEvent[msg.id] || []).find((r) => r.sender === myMatrix && r.key === key);

    // Optimistic local update — refetch will reconcile.
    setReactionsByEvent((prev) => {
      const arr = (prev[msg.id] || []).slice();
      if (existing) {
        const idx = arr.findIndex((r) => r === existing);
        if (idx >= 0) arr.splice(idx, 1);
      } else {
        arr.push({ eventId: '_pending_', sender: myMatrix, key });
      }
      return { ...prev, [msg.id]: arr };
    });

    try {
      if (existing && existing.eventId !== '_pending_') {
        const txn = `x${Date.now()}`;
        await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/redact/${encodeURIComponent(existing.eventId)}/${txn}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
      } else {
        const txn = `r${Date.now()}`;
        await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/send/m.reaction/${txn}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'm.relates_to': { rel_type: 'm.annotation', event_id: msg.id, key },
          }),
        });
      }
    } catch { /* refetch below will reset state */ }
    setTimeout(() => fetchMessages(room.matrixRoomId!), 250);
  };

  // Drop the picked emoji at the current caret of the rich composer. The composer
  // is a TipTap editor (not a textarea), so we go through its imperative handle
  // — the `inputRef` textarea hasn't existed since the composer was upgraded.
  const insertEmojiAtCaret = (emoji: string) => {
    composerRef.current?.focus();
    composerRef.current?.insertText(emoji);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeRoomId || !matrixState.accessToken || !matrixState.homeserver) return;
    const room = rooms.find(r => r.id === activeRoomId);
    if (!room?.matrixRoomId) return;
    setUploading(true);
    try {
      const uploadRes = await fetch(`${matrixState.homeserver}/_matrix/media/v3/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': file.type }, body: file,
      });
      if (uploadRes.ok) {
        const { content_uri } = await uploadRes.json();
        const msgtype = msgtypeForFile(file.type);
        const txnId = `m${Date.now()}`;
        await fetch(`${matrixState.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(room.matrixRoomId)}/send/m.room.message/${txnId}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${matrixState.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype, body: file.name, url: content_uri, info: { mimetype: file.type, size: file.size } }),
        });
        setTimeout(() => fetchMessages(room.matrixRoomId!), 300);
      }
    } catch { }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateProjectRoom = async () => {
    try {
      const res = await fetch('/api/chat/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project', projectId }) });
      if (res.ok) {
        const data = await res.json();
        setRooms(prev => prev.map(r => r.id === projectId ? { ...r, matrixRoomId: data.roomId } : r));
        setActiveRoomId(projectId);
      }
    } catch { }
  };

  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    if (!confirm(`Delete channel "${channelName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/chat/rooms?channelId=${encodeURIComponent(channelId)}`, { method: 'DELETE' });
      if (res.ok) {
        setRooms(prev => prev.filter(r => r.id !== channelId));
        setActiveRoomId(prev => (prev === channelId ? null : prev));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete channel');
      }
    } catch {
      alert('Failed to delete channel');
    }
  };

  const handleCreateChannel = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    setCreatingChannel(true);
    try {
      const res = await fetch('/api/chat/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'channel', name, projectId }) });
      if (res.ok) {
        const data = await res.json();
        const newRoom: RoomInfo = { id: data.channel.id, name: data.channel.name, type: 'channel', matrixRoomId: data.channel.matrixRoomId, unread: 0 };
        setRooms(prev => [...prev, newRoom]);
        setActiveRoomId(newRoom.id);
        setNewChannelName('');
        setShowNewRoom(false);
      }
    } catch { }
    setCreatingChannel(false);
  };

  const startDm = async (target: { kind: 'user' | 'agent'; id: string; name: string; avatarUrl?: string | null }) => {
    setCreatingDm(true);
    try {
      const body: any = { projectId };
      if (target.kind === 'user') body.userId = target.id; else body.agentId = target.id;
      const res = await fetch('/api/chat/dms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const { channel } = await res.json();
        const existing = rooms.find(r => r.id === channel.id);
        if (!existing) {
          const newRoom: RoomInfo = { id: channel.id, name: target.name, type: 'dm', matrixRoomId: channel.matrixRoomId, unread: 0, counterpart: target };
          setRooms(prev => [...prev, newRoom]);
        }
        setActiveRoomId(channel.id);
        setShowNewDm(false);
        setDmPickerQuery('');
      }
    } catch { }
    setCreatingDm(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value; setInputValue(val);
    const cursorPos = e.target.selectionStart || 0;
    const atMatch = val.slice(0, cursorPos).match(/@(\w*)$/);
    if (atMatch) { setMentionQuery(atMatch[1]); setShowMentions(true); setMentionIndex(0); } else { setShowMentions(false); }
    if (val.trim()) notifyTyping(true); else notifyTyping(false);
  };

  const insertMention = (name: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const newBefore = inputValue.slice(0, cursorPos).replace(/@(\w*)$/, `@${name} `);
    setInputValue(newBefore + inputValue.slice(cursorPos));
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const filteredMentions = team.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredMentions[mentionIndex]) insertMention(filteredMentions[mentionIndex].name); return; }
      if (e.key === 'Escape') { setShowMentions(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const mxcToHttp = (url: string) => url.startsWith('mxc://')
    ? `${matrixState.homeserver}/_matrix/media/v3/download/${url.replace('mxc://', '')}`
    : url;

  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.type === 'image' && msg.mediaUrl) {
      return <div><img src={mxcToHttp(msg.mediaUrl)} alt={msg.fileName || 'Image'} className="chat-image" /></div>;
    }
    if (msg.type === 'video' && msg.mediaUrl) {
      return <video src={mxcToHttp(msg.mediaUrl)} controls className="chat-video" preload="metadata" />;
    }
    if (msg.type === 'audio' && msg.mediaUrl) {
      return <audio src={mxcToHttp(msg.mediaUrl)} controls className="chat-audio" preload="metadata" />;
    }
    if (msg.type === 'file' && msg.mediaUrl) {
      return <a href={mxcToHttp(msg.mediaUrl)} target="_blank" rel="noopener noreferrer" className="file-chip"><FileText size={14} /><span>{msg.fileName}</span>{msg.fileSize && <span className="text-tertiary">({(msg.fileSize / 1024).toFixed(1)} KB)</span>}</a>;
    }

    // Text-ish: text, notice, emote. Pick the HTML to render in this order:
    //   1. Sender-supplied formatted_body (sanitized again, defense-in-depth)
    //   2. Markdown render of body, if it looks like markdown
    //   3. Escaped plain text with <br> for newlines
    let innerHtml: string;
    if (msg.formattedHtml) {
      innerHtml = sanitizeIncomingHtml(msg.formattedHtml);
    } else if (looksLikeMarkdown(msg.content)) {
      innerHtml = renderToMatrixHtml(msg.content);
    } else {
      innerHtml = escapeText(msg.content).replace(/\n/g, '<br/>');
    }
    innerHtml = highlightMentionsInHtml(innerHtml);

    if (msg.type === 'emote') {
      // IRC-style "* sender does action" presentation; italic, prefixed.
      return (
        <div className="chat-message-text chat-emote">
          <span className="chat-emote-prefix">* {msg.senderName} </span>
          <ChatMessageContent className="chat-markdown" html={innerHtml} rawText={msg.content} projectId={projectId} />
        </div>
      );
    }
    const className = msg.type === 'notice'
      ? 'chat-message-text chat-notice chat-markdown'
      : 'chat-message-text chat-markdown';
    return <ChatMessageContent className={className} html={innerHtml} rawText={msg.content} projectId={projectId} />;
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId);
  const filteredRooms = rooms.filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) return <div className="chat-container" style={{ alignItems: 'center', justifyContent: 'center' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div className="chat-container">
      {/* Room List */}
      <div className="chat-room-list">
        <div className="chat-room-list-header">
          <span className="heading-4">Chat</span>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowNewDm(v => !v); setShowNewRoom(false); }} title="Start direct message"><AtSign size={16} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowNewRoom(v => !v); setShowNewDm(false); }} title="Create channel"><Plus size={16} /></button>
          </div>
        </div>

        {showNewDm && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-surface-border)', background: 'var(--color-bg-tertiary)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>New Direct Message</div>
            <input className="input" placeholder="Search people or agents..." value={dmPickerQuery} onChange={e => setDmPickerQuery(e.target.value)} autoFocus style={{ height: 30, fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-2)' }} />
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {team.filter(t => t.name.toLowerCase().includes(dmPickerQuery.toLowerCase())).map(t => (
                <button key={`${t.type}-${t.id}`} disabled={creatingDm}
                  onClick={() => startDm({ kind: t.type, id: t.id, name: t.name, avatarUrl: t.avatarUrl })}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: creatingDm ? 'wait' : 'pointer' }}>
                  <div className="avatar avatar-sm" style={{ background: t.type === 'agent' ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: t.type === 'agent' ? 'white' : 'var(--color-accent)', fontSize: 9 }}>{t.type === 'agent' ? 'AI' : getInitials(t.name)}</div>
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>{t.name}</span>
                  {t.type === 'agent' && <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>AI</span>}
                </button>
              ))}
              {team.length === 0 && <div className="text-tertiary text-xs" style={{ padding: 'var(--space-2)' }}>No people yet</div>}
            </div>
          </div>
        )}

        {showNewRoom && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-surface-border)', background: 'var(--color-bg-tertiary)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>New Channel</div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreateChannel(); }} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Hash size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                <input className="input" placeholder="channel-name" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} autoFocus style={{ paddingLeft: 30, height: 34, fontSize: 'var(--font-size-xs)' }} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!newChannelName.trim() || creatingChannel} style={{ height: 34, flexShrink: 0 }}>
                {creatingChannel ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowNewRoom(false); setNewChannelName(''); }} style={{ height: 34, flexShrink: 0 }}><X size={14} /></button>
            </form>
          </div>
        )}

        <div style={{ padding: 'var(--space-2) var(--space-4)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input className="input" placeholder="Search channels..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 32, height: 34, fontSize: 'var(--font-size-xs)' }} />
          </div>
        </div>

        {matrixState.error && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', margin: 'var(--space-2) var(--space-4)', background: 'var(--color-error-muted)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>
            {/failed|fetch|unavailable|not running|ECONNREFUSED/i.test(matrixState.error) ? 'Matrix server not available.' : matrixState.error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredRooms.length === 0 && (
            <div style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center' }}>
              <MessageSquare size={24} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4, margin: '0 auto var(--space-2)' }} />
              <div className="text-tertiary text-sm">No channels yet</div>
            </div>
          )}
          {filteredRooms.map(room => (
            <div key={room.id} className={`chat-room-item ${activeRoomId === room.id ? 'active' : ''}`} onClick={() => { setActiveRoomId(room.id); markRoomRead(room.id); }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-surface-border)', flexShrink: 0, position: 'relative' }}>
                {room.type === 'project' ? <Hash size={16} style={{ color: room.color || 'var(--color-accent)' }} />
                  : room.type === 'dm' ? (
                    <div className="avatar avatar-sm" style={{ background: room.counterpart?.kind === 'agent' ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: room.counterpart?.kind === 'agent' ? 'white' : 'var(--color-accent)', fontSize: 9, width: 24, height: 24 }}>
                      {room.counterpart?.kind === 'agent' ? 'AI' : getInitials(room.counterpart?.name || room.name)}
                    </div>
                  ) : <MessageSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />}
                {room.unread && room.unread > 0 ? <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#00d992', border: '2px solid var(--color-bg-secondary)', animation: 'pulse 2s ease-in-out infinite' }} /> : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="room-name" style={{ fontWeight: room.unread && room.unread > 0 ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)', color: room.unread && room.unread > 0 ? 'var(--color-text-primary)' : undefined }}>{room.name}</div>
                {!room.matrixRoomId && <div className="room-preview" style={{ color: 'var(--color-warning)', fontSize: 'var(--font-size-xs)' }}>No channel — click to setup</div>}
              </div>
              {room.unread && room.unread > 0 ? <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--color-accent)', color: '#000', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>{room.unread}</div> : null}
              {isAdmin && room.type === 'channel' && (
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleDeleteChannel(room.id, room.name); }}
                  title="Delete channel (admin)"
                  style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="chat-main">
        {activeRoom ? (
          <>
            <div style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
              <Hash size={18} style={{ color: activeRoom.color || 'var(--color-accent)' }} />
              <div>
                <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{activeRoom.name}</div>
                <div className="text-tertiary text-xs">{activeRoom.matrixRoomId ? 'Connected' : 'Not connected'}</div>
              </div>
            </div>

            {!activeRoom.matrixRoomId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                  <div style={{ width: 64, height: 64, margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', border: '2px solid var(--color-surface-border)', borderRadius: 'var(--radius-lg)' }}>
                    <MessageSquare size={28} style={{ color: 'var(--color-accent)' }} />
                  </div>
                  <h3 className="heading-4">Set up chat for {activeRoom.name}</h3>
                  <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>Create a chat channel to start messaging.</p>
                  <button className="btn btn-primary" onClick={handleCreateProjectRoom}><Plus size={16} /> Create Channel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="chat-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
                  {messages.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <MessageSquare size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.3, margin: '0 auto var(--space-2)' }} />
                        <div className="text-tertiary text-sm">No messages yet. Start the conversation!</div>
                      </div>
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const showDateSep = idx === 0 || !isSameDay(messages[idx - 1].timestamp, msg.timestamp);
                    const showAuthor = idx === 0 || messages[idx - 1].sender !== msg.sender || showDateSep;
                    const reactions = aggregateReactions(reactionsByEvent[msg.id], matrixState.userId);
                    const parent = msg.inReplyTo ? messages.find((m) => m.id === msg.inReplyTo) : null;
                    return (
                      <div key={msg.id}>
                        {showDateSep && <div className="date-separator">{formatDateSep(msg.timestamp)}</div>}
                        <div
                          className="chat-message"
                          style={{ paddingTop: showAuthor ? 'var(--space-3)' : 0 }}
                          onContextMenu={(e) => {
                            // Skip context menu on placeholder media (no body to act on)
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, msg });
                          }}
                        >
                          {showAuthor ? (
                            <div className="avatar avatar-sm" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)', marginTop: 2 }}>{getInitials(msg.senderName)}</div>
                          ) : (
                            <div style={{ width: 24, flexShrink: 0 }} />
                          )}
                          <div className="chat-message-content">
                            {showAuthor && <div><span className="chat-message-author">{msg.senderName}</span><span className="chat-message-time">{formatMsgTime(msg.timestamp)}</span></div>}
                            {parent && (
                              <div className="chat-reply-quote" title={`Reply to ${parent.senderName}`}>
                                <Reply size={11} />
                                <span className="chat-reply-author">{parent.senderName}</span>
                                <span className="chat-reply-snippet">{parent.content.slice(0, 140)}</span>
                              </div>
                            )}
                            {renderMessageContent(msg)}
                            {reactions.length > 0 && (
                              <div className="reaction-row">
                                {reactions.map((r) => (
                                  <button
                                    key={r.key}
                                    type="button"
                                    className={`reaction-chip ${r.mine ? 'active' : ''}`}
                                    onClick={() => handleToggleReaction(msg, r.key)}
                                    title={r.mine ? 'Remove your reaction' : 'Add your reaction'}
                                  >
                                    <span className="reaction-emoji">{r.key}</span>
                                    <span className="reaction-count">{r.count}</span>
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className="reaction-chip reaction-chip-add"
                                  onClick={(e) => setContextMenu({ x: e.clientX, y: e.clientY, msg })}
                                  title="Add reaction"
                                >
                                  <Smile size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {showScrollBtn && (
                  <div style={{ position: 'relative' }}>
                    <button className="btn btn-primary btn-icon btn-sm" onClick={scrollToBottom} style={{ position: 'absolute', bottom: 8, right: 24, borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-md)' }}><ArrowDown size={14} /></button>
                  </div>
                )}

                {(() => {
                  const typingIds = (activeRoomId ? typingByRoom[activeRoomId] : undefined) || [];
                  if (typingIds.length === 0) return null;
                  const names = typingIds.map((id) => resolveSenderName(id));
                  let label: string;
                  if (names.length === 1) label = `${names[0]} is typing…`;
                  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing…`;
                  else label = `${names.length} people are typing…`;
                  return (
                    <div style={{ padding: 'var(--space-2) var(--space-8)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }}>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                        <span className="typing-dot" style={{ animationDelay: '150ms' }} />
                        <span className="typing-dot" style={{ animationDelay: '300ms' }} />
                      </span>
                      {label}
                    </div>
                  );
                })()}

                <div className="chat-composer" style={{ position: 'relative' }}>
                  {replyingTo && (
                    <div className="reply-preview">
                      <Reply size={12} />
                      <div className="reply-preview-text">
                        <span className="reply-preview-author">{replyingTo.senderName}</span>
                        <span className="reply-preview-snippet">{replyingTo.content.slice(0, 160)}</span>
                      </div>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setReplyingTo(null)} title="Cancel reply">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {showEmojiPicker && (
                    <div className="composer-emoji-pop">
                      <EmojiPicker
                        onPick={(emoji) => insertEmojiAtCaret(emoji)}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    </div>
                  )}
                  <RichComposer
                    ref={composerRef}
                    projectId={projectId}
                    placeholder={`Message #${activeRoom.name}`}
                    className="chat-composer-input"
                    hydrate={hydrateCardKeys}
                    mentionSuggestions={mentionSuggestions}
                    onChange={(md, hasContent) => { setInputValue(md); if (hasContent) notifyTyping(true); }}
                    onSubmit={() => handleSend()}
                    onTyping={() => notifyTyping(true)}
                  />
                  <div className="chat-composer-toolbar">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => fileInputRef.current?.click()} title="Attach file" disabled={uploading}>
                        {uploading ? <Loader2 size={16} className="spin" /> : <Paperclip size={16} />}
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { composerRef.current?.focus(); composerRef.current?.insertText('@'); }} title="Mention"><AtSign size={16} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowEmojiPicker((v) => !v)} title="Emoji"><Smile size={16} /></button>
                      <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={!inputValue.trim() || sending}>
                      {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}<span>Send</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
              <div style={{ width: 80, height: 80, margin: '0 auto var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-tertiary)', border: '2px solid var(--color-accent)', borderRadius: 'var(--radius-lg)' }}>
                <MessageSquare size={36} style={{ color: 'var(--color-accent)' }} />
              </div>
              <h2 className="heading-3">Project Chat</h2>
              <p className="text-secondary" style={{ marginTop: 'var(--space-2)' }}>Select a channel or create one to start messaging.</p>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onReact={(emoji) => handleToggleReaction(contextMenu.msg, emoji)}
          onReply={() => { setReplyingTo(contextMenu.msg); composerRef.current?.focus(); }}
        />
      )}
    </div>
  );
}
