'use client';
import { useState, useEffect, use, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, Loader2, MoreHorizontal, Trash2, Edit3, X, MessageSquare, CheckSquare, Paperclip, Calendar, Users, Tag } from 'lucide-react';
import CardDetailModal from '@/components/kanban/CardDetailModal';
import { formatCardKey } from '@/lib/cardKeys';

interface CardData {
  id: string; title: string; description: string | null; position: number; priority: string;
  labels: string[]; dueDate: string | null;
  number?: number | null;
  assigneeUser: any; assigneeAgent: any;
  members?: Array<{ id: string; user?: { id: string; name: string; avatarUrl: string | null } | null; agent?: { id: string; name: string } | null }>;
  checklists?: Array<{ items: Array<{ isChecked: boolean }> }>;
  subtasks?: Array<{ id: string; column?: { name: string } | null }>;
  _count: { comments: number; subtasks?: number };
  attachments?: Array<any>;
}
interface ColumnData { id: string; name: string; position: number; color: string | null; cards: CardData[]; }

const priorityColors: Record<string, string> = { urgent: 'var(--color-priority-urgent)', high: 'var(--color-priority-high)', medium: 'var(--color-priority-medium)', low: 'var(--color-priority-low)' };

const LABEL_COLORS: Record<string, { color: string; bg: string }> = {
  Design: { color: '#4bce97', bg: 'rgba(75,206,151,0.2)' },
  Frontend: { color: '#f5cd47', bg: 'rgba(245,205,71,0.2)' },
  Backend: { color: '#fea362', bg: 'rgba(254,163,98,0.2)' },
  Bug: { color: '#f87168', bg: 'rgba(248,113,104,0.2)' },
  Feature: { color: '#9f8fef', bg: 'rgba(159,143,239,0.2)' },
  Docs: { color: '#579dff', bg: 'rgba(87,157,255,0.2)' },
  'Good to Have': { color: '#e774bb', bg: 'rgba(231,116,187,0.2)' },
  Urgent: { color: '#6cc3e0', bg: 'rgba(108,195,224,0.2)' },
};

const COL_COLORS = ['#6b7280', '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#ef4444'];

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

export default function BoardPage({ params }: { params: Promise<{ projectId: string; boardId: string }> }) {
  const { projectId, boardId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [boardName, setBoardName] = useState('');
  const [cardKeyPrefix, setCardKeyPrefix] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Column management
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#6b7280');
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState('');
  const [colMenu, setColMenu] = useState<string | null>(null);

  // Card detail
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [detailColumnName, setDetailColumnName] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}/boards`)
      .then(r => r.json())
      .then((boards: any[]) => {
        const board = boards.find((b: any) => b.id === boardId);
        if (board) {
          setBoardName(board.name);
          // Sort columns and cards by position
          const cols = (board.columns || [])
            .sort((a: any, b: any) => a.position - b.position)
            .map((c: any) => ({ ...c, cards: (c.cards || []).sort((a: any, b: any) => a.position - b.position) }));
          setColumns(cols);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, boardId]);

  // Open card from ?card=<id|KEY> deep-link.
  // The param can be either a cuid (legacy / direct) or a human-facing key like
  // "COOP-123" (canonical share form). We resolve key→cuid by walking the
  // loaded columns; until columns load we fall back to passing the param
  // through as-is so the modal can fetch by id (cuids only — keys would 404
  // without resolution, but that's a transient state).
  useEffect(() => {
    const param = searchParams?.get('card');
    if (!param) {
      setDetailCardId(null);
      return;
    }
    const isKey = /^[A-Z][A-Z0-9]{1,5}-\d+$/.test(param);
    for (const col of columns) {
      const match = col.cards.find((c) => {
        if (c.id === param) return true;
        if (isKey && cardKeyPrefix && typeof c.number === 'number') {
          return formatCardKey(cardKeyPrefix, c.number) === param;
        }
        return false;
      });
      if (match) {
        setDetailCardId(match.id);
        setDetailColumnName(col.name);
        return;
      }
    }
    // Param doesn't match a card on this board yet — if it's a cuid, open the
    // modal optimistically (it'll fetch by id). For a key with no prefix
    // loaded, wait — the next render with cardKeyPrefix populated will resolve.
    if (!isKey && columns.length > 0) setDetailCardId(param);
  }, [searchParams, columns, cardKeyPrefix]);

  // Push a new ?card= param when opening a card (so the URL is shareable)
  // and strip it on close. Prefer the key form when available; fall back to
  // cuid for cards that haven't been backfilled.
  const openCardInUrl = (card: CardData, columnName: string) => {
    setDetailColumnName(columnName);
    const key = (cardKeyPrefix && typeof card.number === 'number')
      ? formatCardKey(cardKeyPrefix, card.number)
      : card.id;
    const url = new URL(window.location.href);
    url.searchParams.set('card', key);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const closeCardInUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('card');
    router.replace(url.pathname + (url.search || ''), { scroll: false });
  };

  // Fetch full board data with cards
  useEffect(() => {
    if (!boardId) return;
    // Re-fetch from the project API to get card details
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then((proj: any) => {
        if (proj?.cardKeyPrefix) setCardKeyPrefix(proj.cardKeyPrefix);
        const board = proj.boards?.find((b: any) => b.id === boardId);
        if (board) {
          setBoardName(board.name);
          const cols = (board.columns || [])
            .sort((a: any, b: any) => a.position - b.position)
            .map((c: any) => ({ ...c, cards: (c.cards || []).sort((a: any, b: any) => a.position - b.position) }));
          setColumns(cols);
        }
      });
  }, [projectId, boardId]);

  // --- Drag & Drop ---
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId, type } = result;

    if (type === 'COLUMN') {
      const newColumns = [...columns];
      const [moved] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, moved);
      setColumns(newColumns);
      await fetch(`/api/columns/${draggableId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: destination.index }) });
      return;
    }

    const newColumns = [...columns.map((c) => ({ ...c, cards: [...c.cards] }))];
    const srcCol = newColumns.find((c) => c.id === source.droppableId);
    const dstCol = newColumns.find((c) => c.id === destination.droppableId);
    if (!srcCol || !dstCol) return;
    const [moved] = srcCol.cards.splice(source.index, 1);
    dstCol.cards.splice(destination.index, 0, moved);
    setColumns(newColumns);
    await fetch(`/api/cards/${draggableId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: destination.droppableId, position: destination.index }) });
  };

  // --- Card CRUD ---
  const handleAddCard = async (columnId: string) => {
    if (!newTitle.trim()) return;
    const res = await fetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId, title: newTitle }) });
    if (res.ok) {
      const card = await res.json();
      setColumns(prev => prev.map(c => c.id === columnId ? { ...c, cards: [...c.cards, card] } : c));
      setNewTitle('');
      setAddingTo(null);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
    setColumns(prev => prev.map(c => ({ ...c, cards: c.cards.filter(card => card.id !== cardId) })));
    setDetailCardId(null);
  };

  const handleCardUpdate = (updatedCard: any) => {
    setColumns(prev => prev.map(c => ({ ...c, cards: c.cards.map(card => card.id === updatedCard.id ? { ...card, ...updatedCard } : card) })));
  };

  // --- Column CRUD ---
  const handleAddColumn = async () => {
    if (!newColName.trim()) return;
    const res = await fetch('/api/columns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId, name: newColName, color: newColColor }) });
    if (res.ok) {
      const col = await res.json();
      setColumns(prev => [...prev, col]);
      setNewColName('');
      setShowAddColumn(false);
    }
  };

  const handleEditColumn = async (colId: string) => {
    if (!editColName.trim()) return;
    await fetch(`/api/columns/${colId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editColName }) });
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name: editColName } : c));
    setEditingCol(null);
  };

  const handleDeleteColumn = async (colId: string) => {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    const msg = col.cards.length > 0 ? `Delete "${col.name}" and its ${col.cards.length} card(s)? This cannot be undone.` : `Delete "${col.name}"?`;
    if (!confirm(msg)) return;
    await fetch(`/api/columns/${colId}`, { method: 'DELETE' });
    setColumns(prev => prev.filter(c => c.id !== colId));
    setColMenu(null);
  };

  const handleEditColumnColor = async (colId: string, color: string) => {
    await fetch(`/api/columns/${colId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color }) });
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, color } : c));
  };

  // Trello-style click-and-drag horizontal scroll on empty board space
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  const onBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Only start drag on empty board background — not on cards, columns, buttons, inputs
    if (target.closest('[data-rbd-draggable-id], button, a, input, textarea, [contenteditable]')) return;
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const onBoardMouseMove = (e: React.MouseEvent) => {
    const s = dragState.current;
    if (!s.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) s.moved = true;
    el.scrollLeft = s.scrollLeft - dx;
    el.scrollTop = s.scrollTop - dy;
  };
  const onBoardMouseUp = () => {
    const s = dragState.current;
    if (!s.active) return;
    s.active = false;
    const el = scrollRef.current;
    if (el) { el.style.cursor = ''; el.style.userSelect = ''; }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
        <h1 className="heading-3">{boardName}</h1>
        <span className="badge badge-accent">{columns.reduce((t, c) => t + c.cards.length, 0)} cards</span>
      </div>

      {/* Board */}
      <div
        ref={scrollRef}
        onMouseDown={onBoardMouseDown}
        onMouseMove={onBoardMouseMove}
        onMouseUp={onBoardMouseUp}
        onMouseLeave={onBoardMouseUp}
        className="kanban-scroll"
        data-coach-target="board"
        style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'auto', padding: 'var(--space-4) var(--space-8)', cursor: 'grab' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board" type="COLUMN" direction="horizontal">
            {(boardProvided) => (
              <div ref={boardProvided.innerRef} {...boardProvided.droppableProps}
                style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', minWidth: 'fit-content' }}>
                {columns.map((col, colIdx) => (
                  <Draggable key={col.id} draggableId={col.id} index={colIdx}>
                    {(colProvided, colSnapshot) => (
                      <div ref={colProvided.innerRef} {...colProvided.draggableProps}
                        style={{ ...colProvided.draggableProps.style, width: 'var(--kanban-column-width)', flexShrink: 0, opacity: colSnapshot.isDragging ? 0.8 : 1 }}>
                        {/* Column header */}
                        <div {...colProvided.dragHandleProps}
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', padding: '0 var(--space-2)', position: 'relative' }}>
                          <div style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: col.color || 'var(--color-text-tertiary)' }} />
                          {editingCol === col.id ? (
                            <input className="inline-edit" value={editColName}
                              onChange={e => setEditColName(e.target.value)}
                              onBlur={() => handleEditColumn(col.id)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEditColumn(col.id); if (e.key === 'Escape') setEditingCol(null); }}
                              autoFocus style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                          ) : (
                            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                              onDoubleClick={() => { setEditingCol(col.id); setEditColName(col.name); }}>
                              {col.name}
                            </span>
                          )}
                          <span className="badge" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{col.cards.length}</span>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setColMenu(colMenu === col.id ? null : col.id)}
                            style={{ opacity: 0.5 }}><MoreHorizontal size={14} /></button>
                          {/* Column dropdown menu */}
                          {colMenu === col.id && (
                            <div className="dropdown" style={{ top: '100%', right: 0, marginTop: 'var(--space-1)' }}>
                              <button className="dropdown-item" onClick={() => { setEditingCol(col.id); setEditColName(col.name); setColMenu(null); }}>
                                <Edit3 size={14} /> Rename
                              </button>
                              <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                <div className="text-xs text-tertiary" style={{ marginBottom: 'var(--space-1)' }}>Color</div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {COL_COLORS.map(c => (
                                    <button key={c} onClick={() => { handleEditColumnColor(col.id, c); setColMenu(null); }}
                                      style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', background: c, border: col.color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
                                  ))}
                                </div>
                              </div>
                              <div className="divider" style={{ margin: 'var(--space-1) 0' }} />
                              <button className="dropdown-item" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteColumn(col.id)}>
                                <Trash2 size={14} /> Delete column
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Cards */}
                        <Droppable droppableId={col.id} type="CARD">
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.droppableProps}
                              style={{ minHeight: 120, padding: 'var(--space-2)', background: snapshot.isDraggingOver ? 'var(--color-bg-tertiary)' : 'transparent', borderRadius: 'var(--radius-lg)', transition: 'background var(--transition-fast)' }}>
                              {col.cards.map((card, idx) => (
                                <Draggable key={card.id} draggableId={card.id} index={idx}>
                                  {(provided, snapshot) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                      className="glass-card" style={{ ...provided.draggableProps.style, padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-2)', cursor: 'grab', opacity: snapshot.isDragging ? 0.8 : 1, borderLeft: `3px solid ${priorityColors[card.priority] || 'var(--color-text-tertiary)'}` }}
                                      // Tag the very first card on the very first column so the onboarding
                                      // coach can anchor its "open a card" step at a real element.
                                      {...(colIdx === 0 && idx === 0 ? { 'data-coach-target': 'card-list' } : {})}
                                      onClick={() => openCardInUrl(card, col.name)}>
                                      {/* Labels */}
                                      {card.labels && card.labels.length > 0 && (
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                                          {card.labels.map((label: string) => {
                                            const lc = LABEL_COLORS[label];
                                            return <span key={label} style={{ display: 'inline-block', width: 32, height: 6, borderRadius: 3, background: lc?.color || '#8b949e' }} />;
                                          })}
                                        </div>
                                      )}
                                      {/* Title */}
                                      <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', marginBottom: card.description ? 'var(--space-1)' : 0 }}>{card.title}</div>
                                      {card.description && <div className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-2)' }}>{card.description.slice(0, 80)}{card.description.length > 80 ? '...' : ''}</div>}
                                      {/* Bottom row */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                        {card.dueDate && (
                                          <span className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 2, color: new Date(card.dueDate) < new Date() ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}>
                                            <Calendar size={10} /> {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        )}
                                        {card.checklists && card.checklists.length > 0 && (() => {
                                          const total = card.checklists.reduce((t: number, cl: any) => t + cl.items.length, 0);
                                          const done = card.checklists.reduce((t: number, cl: any) => t + cl.items.filter((i: any) => i.isChecked).length, 0);
                                          return total > 0 ? (
                                            <span className="text-xs text-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                              <CheckSquare size={10} /> {done}/{total}
                                            </span>
                                          ) : null;
                                        })()}
                                        {card.subtasks && card.subtasks.length > 0 && (() => {
                                          const total = card.subtasks.length;
                                          const done = card.subtasks.filter(s => /done|shipped|complete/i.test(s.column?.name || '')).length;
                                          return (
                                            <span className="text-xs text-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 2 }} title="Subtasks">
                                              ↳ {done}/{total}
                                            </span>
                                          );
                                        })()}
                                        {card._count.comments > 0 && <span className="text-tertiary text-xs" style={{ display: 'flex', alignItems: 'center', gap: 2 }}><MessageSquare size={10} />{card._count.comments}</span>}
                                        {card.attachments && card.attachments.length > 0 && <span className="text-tertiary text-xs" style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Paperclip size={10} />{card.attachments.length}</span>}
                                        {/* Member avatars */}
                                        {card.members && card.members.length > 0 && (
                                          <div style={{ display: 'flex', marginLeft: 'auto' }}>
                                            {card.members.slice(0, 3).map((m: any, i: number) => (
                                              <div key={m.id} className="avatar avatar-sm"
                                                style={{ marginLeft: i > 0 ? -6 : 0, border: '2px solid var(--color-bg-secondary)', background: m.agent ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: m.agent ? 'white' : 'var(--color-accent)', fontSize: 9 }}>
                                                {m.user ? getInitials(m.user.name) : 'AI'}
                                              </div>
                                            ))}
                                            {card.members.length > 3 && <div className="avatar avatar-sm" style={{ marginLeft: -6, border: '2px solid var(--color-bg-secondary)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', fontSize: 9 }}>+{card.members.length - 3}</div>}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        {/* Add card */}
                        {addingTo === col.id ? (
                          <div style={{ padding: 'var(--space-2)' }}>
                            <input className="input" placeholder="Card title..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCard(col.id); if (e.key === 'Escape') { setAddingTo(null); setNewTitle(''); } }} />
                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleAddCard(col.id)}>Add</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setAddingTo(null); setNewTitle(''); }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 'var(--space-1)' }}
                            onClick={() => { setAddingTo(col.id); setNewTitle(''); }}><Plus size={14} />Add card</button>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {boardProvided.placeholder}

                {/* Add column */}
                <div style={{ width: 'var(--kanban-column-width)', flexShrink: 0 }}>
                  {showAddColumn ? (
                    <div className="glass-panel" style={{ padding: 'var(--space-4)' }}>
                      <input className="input" placeholder="Column name" value={newColName} onChange={e => setNewColName(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setShowAddColumn(false); setNewColName(''); } }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                        {COL_COLORS.map(c => (
                          <button key={c} onClick={() => setNewColColor(c)}
                            style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', background: c, border: newColColor === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAddColumn}>Add Column</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddColumn(false); setNewColName(''); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setShowAddColumn(true)}
                      style={{ width: '100%', justifyContent: 'flex-start', padding: 'var(--space-3) var(--space-4)', border: '1px dashed var(--color-surface-border)', borderRadius: 'var(--radius-lg)' }}>
                      <Plus size={14} /> Add column
                    </button>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Card Detail Modal */}
      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          columnName={detailColumnName}
          projectId={projectId}
          onClose={() => { setDetailCardId(null); closeCardInUrl(); }}
          onUpdate={handleCardUpdate}
          onDelete={handleDeleteCard}
        />
      )}
    </div>
  );
}
