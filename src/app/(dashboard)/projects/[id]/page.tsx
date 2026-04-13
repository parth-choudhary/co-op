'use client';
import { useState, useEffect, use } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, Loader2, MoreHorizontal, Trash2, Edit3, X, MessageSquare } from 'lucide-react';

interface CardData { id: string; title: string; description: string | null; position: number; priority: string; labels: string[]; assigneeUser: any; assigneeAgent: any; _count: { comments: number }; }
interface ColumnData { id: string; name: string; position: number; color: string | null; cards: CardData[]; }
interface BoardData { id: string; name: string; columns: ColumnData[]; }
interface ProjectData { id: string; name: string; color: string; boards: BoardData[]; }

const priorityColors: Record<string, string> = { urgent: 'var(--color-priority-urgent)', high: 'var(--color-priority-high)', medium: 'var(--color-priority-medium)', low: 'var(--color-priority-low)' };

export default function ProjectKanbanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [editCard, setEditCard] = useState<CardData | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', priority: '' });

  useEffect(() => { fetch(`/api/projects/${id}`).then((r) => r.json()).then(setProject).finally(() => setLoading(false)); }, [id]);

  const board = project?.boards?.[0];
  const columns = board?.columns || [];

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !board) return;
    const { source, destination, draggableId } = result;
    const newColumns = [...columns.map((c) => ({ ...c, cards: [...c.cards] }))];
    const srcCol = newColumns.find((c) => c.id === source.droppableId);
    const dstCol = newColumns.find((c) => c.id === destination.droppableId);
    if (!srcCol || !dstCol) return;
    const [moved] = srcCol.cards.splice(source.index, 1);
    dstCol.cards.splice(destination.index, 0, moved);
    setProject({ ...project!, boards: [{ ...board, columns: newColumns }] });
    await fetch(`/api/cards/${draggableId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: destination.droppableId, position: destination.index }) });
  };

  const handleAddCard = async (columnId: string) => {
    if (!newTitle.trim()) return;
    const res = await fetch('/api/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId, title: newTitle }) });
    if (res.ok) {
      const card = await res.json();
      setProject((prev) => {
        if (!prev) return prev;
        const newBoard = { ...prev.boards[0], columns: prev.boards[0].columns.map((c) => c.id === columnId ? { ...c, cards: [...c.cards, card] } : c) };
        return { ...prev, boards: [newBoard] };
      });
      setNewTitle('');
      setAddingTo(null);
    }
  };

  const handleUpdateCard = async () => {
    if (!editCard) return;
    const res = await fetch(`/api/cards/${editCard.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) });
    if (res.ok) {
      const updated = await res.json();
      setProject((prev) => {
        if (!prev) return prev;
        const newBoard = { ...prev.boards[0], columns: prev.boards[0].columns.map((c) => ({ ...c, cards: c.cards.map((card) => card.id === editCard.id ? updated : card) })) };
        return { ...prev, boards: [newBoard] };
      });
      setEditCard(null);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
    setProject((prev) => {
      if (!prev) return prev;
      const newBoard = { ...prev.boards[0], columns: prev.boards[0].columns.map((c) => ({ ...c, cards: c.cards.filter((card) => card.id !== cardId) })) };
      return { ...prev, boards: [newBoard] };
    });
    setEditCard(null);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}><Loader2 size={24} className="spin" style={{ color: 'var(--color-text-tertiary)' }} /></div>;
  if (!project) return <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}><p className="text-secondary">Project not found</p></div>;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: 'var(--radius-full)', background: project.color }} />
        <h1 className="heading-3">{project.name}</h1>
        {board && <span className="badge badge-accent" style={{ marginLeft: 'var(--space-2)' }}>{board.name}</span>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', minWidth: 'fit-content' }}>
            {columns.map((col) => (
              <div key={col.id} style={{ width: 'var(--kanban-column-width)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', padding: '0 var(--space-2)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: col.color || 'var(--color-text-tertiary)' }} />
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>{col.name}</span>
                  <span className="badge" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{col.cards.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      style={{ minHeight: 120, padding: 'var(--space-2)', background: snapshot.isDraggingOver ? 'var(--color-bg-tertiary)' : 'transparent', borderRadius: 'var(--radius-lg)', transition: 'background var(--transition-fast)' }}>
                      {col.cards.map((card, idx) => (
                        <Draggable key={card.id} draggableId={card.id} index={idx}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                              className="glass-card" style={{ ...provided.draggableProps.style, padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-2)', cursor: 'grab', opacity: snapshot.isDragging ? 0.8 : 1, borderLeft: `3px solid ${priorityColors[card.priority] || 'var(--color-text-tertiary)'}` }}
                              onClick={() => { setEditCard(card); setEditForm({ title: card.title, description: card.description || '', priority: card.priority }); }}>
                              <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', marginBottom: card.description ? 'var(--space-1)' : 0 }}>{card.title}</div>
                              {card.description && <div className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-2)' }}>{card.description.slice(0, 80)}{card.description.length > 80 ? '...' : ''}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="badge" style={{ background: `${priorityColors[card.priority]}20`, color: priorityColors[card.priority], textTransform: 'capitalize' }}>{card.priority}</span>
                                {card._count.comments > 0 && <span className="text-tertiary text-xs" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}><MessageSquare size={10} />{card._count.comments}</span>}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
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
            ))}
          </div>
        </DragDropContext>
      </div>

      {editCard && (
        <div className="modal-overlay" onClick={() => setEditCard(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-6) var(--space-6) var(--space-4)' }}>
              <h2 className="heading-3">Edit Card</h2>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteCard(editCard.id)} title="Delete"><Trash2 size={14} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditCard(null)}><X size={16} /></button>
              </div>
            </div>
            <div style={{ padding: '0 var(--space-6) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div className="form-group"><label className="form-label">Title</label><input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Description</label><textarea className="input textarea" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Add a description..." /></div>
              <div className="form-group"><label className="form-label">Priority</label><select className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-secondary" onClick={() => setEditCard(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdateCard}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
