'use client';
import { useState, useEffect, useRef } from 'react';
import {
  X, Plus, Calendar, CheckSquare, Paperclip, Users, Tag, Trash2,
  Clock, MoreHorizontal, MessageSquare, Download, FileText, Image as ImageIcon,
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import CardCodePanel from './CardCodePanel';
import MessageBody from '@/components/MessageBody';
import RichComposer, { type RichComposerHandle } from '@/components/editor/RichComposer';
import { useCardHydrator } from '@/components/editor/useCardHydrator';
import type { MentionItem } from '@/components/editor/MentionList';

// ---- Types ----
interface MemberData {
  id: string;
  userId?: string | null;
  agentId?: string | null;
  user?: { id: string; name: string; avatarUrl: string | null; email: string } | null;
  agent?: { id: string; name: string; role: string; avatarUrl: string | null } | null;
}
interface ChecklistItemData { id: string; content: string; isChecked: boolean; position: number; }
interface ChecklistData { id: string; title: string; position: number; items: ChecklistItemData[]; }
interface SubtaskData {
  id: string; title: string; priority: string; position: number;
  columnId: string;
  assigneeUser?: { id: string; name: string; avatarUrl: string | null } | null;
  assigneeAgent?: { id: string; name: string; role: string; avatarUrl: string | null } | null;
  column?: { id: string; name: string; color: string | null } | null;
}
interface AttachmentData { id: string; name: string; url: string; mimeType: string | null; size: number | null; createdAt: string; }
interface ActivityData { id: string; type: string; content: string; actorId: string; actorType: string; createdAt: string; }
interface CommentData { id: string; content: string; authorType: string; authorId: string; parentCommentId?: string | null; author?: { id: string; name: string; avatarUrl: string | null; role?: string | null } | null; createdAt: string; }

interface CardDetailData {
  id: string; title: string; description: string | null; priority: string; labels: string[];
  dueDate: string | null; coverImage: string | null; columnId: string;
  assigneeAgentId?: string | null;
  activeRunId?: string | null;
  parentCardId?: string | null;
  parent?: { id: string; title: string } | null;
  members: MemberData[]; checklists: ChecklistData[]; attachments: AttachmentData[];
  subtasks: SubtaskData[];
  _count: { comments: number; activities: number; subtasks?: number };
}
interface TeamUser { id: string; name: string; email: string; avatarUrl: string | null; role: string; }
interface TeamAgent { id: string; name: string; role: string; roleLabel: string; avatarUrl: string | null; }

const LABEL_COLORS = [
  { name: 'Design', color: '#4bce97', bg: 'rgba(75,206,151,0.2)' },
  { name: 'Frontend', color: '#f5cd47', bg: 'rgba(245,205,71,0.2)' },
  { name: 'Backend', color: '#fea362', bg: 'rgba(254,163,98,0.2)' },
  { name: 'Bug', color: '#f87168', bg: 'rgba(248,113,104,0.2)' },
  { name: 'Feature', color: '#9f8fef', bg: 'rgba(159,143,239,0.2)' },
  { name: 'Docs', color: '#579dff', bg: 'rgba(87,157,255,0.2)' },
  { name: 'Good to Have', color: '#e774bb', bg: 'rgba(231,116,187,0.2)' },
  { name: 'Urgent', color: '#6cc3e0', bg: 'rgba(108,195,224,0.2)' },
];

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const formatTime = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

interface Props {
  cardId: string;
  columnName: string;
  projectId?: string;
  onClose: () => void;
  onUpdate: (card: any) => void;
  onDelete: (cardId: string) => void;
}

export default function CardDetailModal({ cardId, columnName, projectId, onClose, onUpdate, onDelete }: Props) {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [newComment, setNewComment] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [team, setTeam] = useState<{ users: TeamUser[]; agents: TeamAgent[] }>({ users: [], agents: [] });
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemContent, setNewItemContent] = useState('');
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [subtaskAssigneePickerFor, setSubtaskAssigneePickerFor] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const commentComposerRef = useRef<RichComposerHandle>(null);
  const hydrateCardKeys = useCardHydrator(projectId || '');
  const commentMentionSuggestions = (query: string): MentionItem[] => {
    const q = query.toLowerCase();
    return [
      ...team.users.filter((u) => u.name.toLowerCase().includes(q)).map((u) => ({ id: u.id, label: u.name, kind: 'user' as const, sub: u.email })),
      ...team.agents.filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({ id: a.id, label: a.name, kind: 'agent' as const, sub: a.roleLabel })),
    ];
  };

  // Close any open picker popover when user clicks outside of it (and outside its trigger).
  useEffect(() => {
    const anyOpen = showMemberPicker || showLabelPicker || editingDueDate || showAddChecklist || subtaskAssigneePickerFor !== null;
    if (!anyOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside any popover or on the quick-action buttons that toggle them.
      if (target.closest('.popover') || target.closest('.quick-action-btn') || target.closest('.subtask-assignee-trigger')) return;
      setShowMemberPicker(false);
      setShowLabelPicker(false);
      setEditingDueDate(false);
      setShowAddChecklist(false);
      setSubtaskAssigneePickerFor(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showMemberPicker, showLabelPicker, editingDueDate, showAddChecklist, subtaskAssigneePickerFor]);

  // Fetch card detail
  useEffect(() => {
    Promise.all([
      fetch(`/api/cards/${cardId}`).then(r => r.json()),
      fetch(`/api/cards/${cardId}/comments`).then(r => r.json()),
      fetch(`/api/cards/${cardId}/activity`).then(r => r.json()),
      fetch(projectId ? `/api/team?projectId=${projectId}` : '/api/team').then(r => r.json()),
    ]).then(([cardData, commentsData, activityData, teamData]) => {
      setCard(cardData);
      setTitleValue(cardData.title);
      setDescValue(cardData.description || '');
      setComments(commentsData.comments || []);
      setActivities(activityData.activities || []);
      setTeam(teamData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [cardId, projectId]);

  const updateCard = async (data: any) => {
    const res = await fetch(`/api/cards/${cardId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      const updated = await res.json();
      setCard(updated);
      onUpdate(updated);
    }
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== card?.title) updateCard({ title: titleValue });
  };

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (descValue !== (card?.description || '')) updateCard({ description: descValue });
  };

  // Members
  const addMember = async (userId?: string, agentId?: string) => {
    const res = await fetch(`/api/cards/${cardId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, agentId }) });
    if (res.ok) {
      const m = await res.json();
      setCard(prev => prev ? { ...prev, members: [...prev.members, m] } : prev);
    }
  };
  const removeMember = async (memberId: string) => {
    await fetch(`/api/cards/${cardId}/members`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) });
    setCard(prev => prev ? { ...prev, members: prev.members.filter(m => m.id !== memberId) } : prev);
  };

  // Labels
  const toggleLabel = (label: string) => {
    if (!card) return;
    const labels = card.labels.includes(label) ? card.labels.filter((l: string) => l !== label) : [...card.labels, label];
    updateCard({ labels });
    setCard(prev => prev ? { ...prev, labels } : prev);
  };

  // Checklists
  const addChecklist = async () => {
    if (!newChecklistTitle.trim()) return;
    const res = await fetch(`/api/cards/${cardId}/checklists`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newChecklistTitle }) });
    if (res.ok) {
      const cl = await res.json();
      setCard(prev => prev ? { ...prev, checklists: [...prev.checklists, cl] } : prev);
      setNewChecklistTitle('');
      setShowAddChecklist(false);
    }
  };
  const deleteChecklist = async (checklistId: string) => {
    await fetch(`/api/cards/${cardId}/checklists/${checklistId}`, { method: 'DELETE' });
    setCard(prev => prev ? { ...prev, checklists: prev.checklists.filter(c => c.id !== checklistId) } : prev);
  };
  const addChecklistItem = async (checklistId: string) => {
    if (!newItemContent.trim()) return;
    const res = await fetch(`/api/cards/${cardId}/checklists/${checklistId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newItemContent }) });
    if (res.ok) {
      const item = await res.json();
      setCard(prev => prev ? { ...prev, checklists: prev.checklists.map(c => c.id === checklistId ? { ...c, items: [...c.items, item] } : c) } : prev);
      setNewItemContent('');
      setAddingItemTo(null);
    }
  };
  const toggleChecklistItem = async (checklistId: string, itemId: string, isChecked: boolean) => {
    await fetch(`/api/cards/${cardId}/checklists/${checklistId}/items`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, isChecked: !isChecked }) });
    setCard(prev => prev ? { ...prev, checklists: prev.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, isChecked: !isChecked } : i) } : c) } : prev);
  };
  const deleteChecklistItem = async (checklistId: string, itemId: string) => {
    await fetch(`/api/cards/${cardId}/checklists/${checklistId}/items`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
    setCard(prev => prev ? { ...prev, checklists: prev.checklists.map(c => c.id === checklistId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c) } : prev);
  };

  // Subtasks
  const addSubtask = async () => {
    if (!newSubtaskTitle.trim() || !card) return;
    const res = await fetch('/api/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: card.columnId, title: newSubtaskTitle, parentCardId: card.id }),
    });
    if (res.ok) {
      const created = await res.json();
      const sub: SubtaskData = {
        id: created.id, title: created.title, priority: created.priority, position: created.position,
        columnId: created.columnId,
        column: created.column || null,
        assigneeUser: created.assigneeUser || null,
        assigneeAgent: created.assigneeAgent || null,
      };
      setCard(prev => prev ? { ...prev, subtasks: [...prev.subtasks, sub] } : prev);
      setNewSubtaskTitle('');
      setAddingSubtask(false);
    }
  };
  const assignSubtask = async (subtaskId: string, userId?: string, agentId?: string) => {
    const res = await fetch(`/api/cards/${subtaskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assigneeUserId: userId || null,
        assigneeAgentId: agentId || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCard(prev => prev ? {
        ...prev,
        subtasks: prev.subtasks.map(s => s.id === subtaskId ? {
          ...s,
          assigneeUser: updated.assigneeUser || null,
          assigneeAgent: updated.assigneeAgent || null,
        } : s),
      } : prev);
    }
    setSubtaskAssigneePickerFor(null);
  };
  const deleteSubtask = async (subtaskId: string) => {
    await fetch(`/api/cards/${subtaskId}`, { method: 'DELETE' });
    setCard(prev => prev ? { ...prev, subtasks: prev.subtasks.filter(s => s.id !== subtaskId) } : prev);
  };

  // Attachments
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For now, create a data URL. In production, upload to Matrix media or S3.
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, url: reader.result as string, mimeType: file.type, size: file.size }),
      });
      if (res.ok) {
        const att = await res.json();
        setCard(prev => prev ? { ...prev, attachments: [att, ...prev.attachments] } : prev);
      }
    };
    reader.readAsDataURL(file);
  };
  const deleteAttachment = async (attachmentId: string) => {
    await fetch(`/api/cards/${cardId}/attachments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId }) });
    setCard(prev => prev ? { ...prev, attachments: prev.attachments.filter(a => a.id !== attachmentId) } : prev);
  };

  // Comments
  const addComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch(`/api/cards/${cardId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment, parentCommentId: replyTo?.id || null }),
    });
    if (res.ok) {
      const c = await res.json();
      setComments(prev => [c, ...prev]);
      setNewComment('');
      commentComposerRef.current?.clear();
      setReplyTo(null);
    }
  };

  // Delete card
  const handleDelete = () => {
    if (confirm('Delete this card? This cannot be undone.')) {
      onDelete(cardId);
    }
  };

  if (loading) {
    return (
      <div className="card-detail-overlay" onClick={onClose}>
        <div className="card-detail-modal" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <div className="spin" style={{ width: 24, height: 24, border: '2px solid var(--color-surface-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%' }} />
        </div>
      </div>
    );
  }

  if (!card) return null;

  const getChecklistProgress = (cl: ChecklistData) => {
    if (cl.items.length === 0) return 0;
    return Math.round((cl.items.filter(i => i.isChecked).length / cl.items.length) * 100);
  };

  return (
    <div className="card-detail-overlay" onClick={onClose}>
      <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="card-detail-header">
          <div style={{ flex: 1 }}>
            <div className="text-tertiary text-xs" style={{ marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {card.parent && (
                <>
                  <span
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => {
                      onClose();
                      window.history.pushState(null, '', `?card=${card.parent!.id}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    title="Open parent card"
                  >
                    ↑ {card.parent.title}
                  </span>
                  <span style={{ margin: '0 var(--space-2)' }}>/</span>
                </>
              )}
              {columnName}
            </div>
            {editingTitle ? (
              <input ref={titleRef} className="inline-edit heading-3" value={titleValue} onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur} onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur(); if (e.key === 'Escape') { setTitleValue(card.title); setEditingTitle(false); } }}
                autoFocus style={{ fontFamily: 'var(--font-family-heading)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-xl)' }} />
            ) : (
              <h2 className="heading-3" style={{ cursor: 'pointer' }} onClick={() => setEditingTitle(true)}>{card.title}</h2>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={handleDelete} title="Delete card"><Trash2 size={14} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-action-bar" style={{ padding: 'var(--space-4) var(--space-6) 0' }}>
          <button className="quick-action-btn" onClick={() => setShowMemberPicker(!showMemberPicker)}><Users size={14} />Members</button>
          <button className="quick-action-btn" onClick={() => setShowLabelPicker(!showLabelPicker)}><Tag size={14} />Labels</button>
          <button className="quick-action-btn" onClick={() => setEditingDueDate(!editingDueDate)}><Calendar size={14} />Dates</button>
          <button className="quick-action-btn" onClick={() => setShowAddChecklist(!showAddChecklist)}><CheckSquare size={14} />Checklist</button>
          <label className="quick-action-btn" style={{ cursor: 'pointer' }}>
            <Paperclip size={14} />Attachment
            <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Member Picker Popover */}
        {showMemberPicker && (
          <div style={{ position: 'relative', padding: '0 var(--space-6)' }}>
            <div className="popover" style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
              <div className="popover-header"><h4>Members</h4><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowMemberPicker(false)}><X size={14} /></button></div>
              <div className="popover-body">
                {team.users.map(u => {
                  const isMember = card.members.some(m => m.userId === u.id);
                  return (
                    <div key={u.id} className={`popover-item ${isMember ? 'selected' : ''}`} onClick={() => isMember ? removeMember(card.members.find(m => m.userId === u.id)!.id) : addMember(u.id)}>
                      <div className="avatar avatar-sm" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>{getInitials(u.name)}</div>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{u.name}</div><div className="text-tertiary text-xs">{u.email}</div></div>
                      {isMember && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                    </div>
                  );
                })}
                {team.agents.map(a => {
                  const isMember = card.members.some(m => m.agentId === a.id);
                  return (
                    <div key={a.id} className={`popover-item ${isMember ? 'selected' : ''}`} onClick={() => isMember ? removeMember(card.members.find(m => m.agentId === a.id)!.id) : addMember(undefined, a.id)}>
                      <div className="avatar avatar-sm" style={{ background: 'var(--color-role-cto)', color: 'white' }}>{getInitials(a.name)}</div>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{a.name}</div><div className="text-tertiary text-xs">{a.roleLabel}</div></div>
                      {isMember && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                    </div>
                  );
                })}
                {team.users.length === 0 && team.agents.length === 0 && <div className="text-tertiary text-sm" style={{ padding: 'var(--space-2)' }}>No team members found</div>}
              </div>
            </div>
          </div>
        )}

        {/* Label Picker Popover */}
        {showLabelPicker && (
          <div style={{ position: 'relative', padding: '0 var(--space-6)' }}>
            <div className="popover" style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
              <div className="popover-header"><h4>Labels</h4><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowLabelPicker(false)}><X size={14} /></button></div>
              <div className="popover-body">
                {LABEL_COLORS.map(l => (
                  <div key={l.name} className={`popover-item ${card.labels.includes(l.name) ? 'selected' : ''}`} onClick={() => toggleLabel(l.name)}>
                    <div style={{ width: 32, height: 20, borderRadius: 'var(--radius-sm)', background: l.bg, border: `2px solid ${l.color}` }} />
                    <span>{l.name}</span>
                    {card.labels.includes(l.name) && <span style={{ color: 'var(--color-accent)', marginLeft: 'auto' }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Due Date Picker */}
        {editingDueDate && (
          <div style={{ position: 'relative', padding: '0 var(--space-6)' }}>
            <div className="popover" style={{ position: 'relative', marginBottom: 'var(--space-3)', display: 'inline-block', width: 'auto', maxWidth: 320 }}>
              <div className="popover-header"><h4>Due Date</h4><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingDueDate(false)}><X size={14} /></button></div>
              <div className="popover-body">
                <DayPicker
                  mode="single"
                  selected={card.dueDate ? new Date(card.dueDate) : undefined}
                  onSelect={(d) => {
                    const iso = d ? d.toISOString() : null;
                    updateCard({ dueDate: iso });
                    setCard(prev => prev ? { ...prev, dueDate: iso } : prev);
                  }}
                  showOutsideDays
                  weekStartsOn={1}
                />
                {card.dueDate && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-2)', color: 'var(--color-error)' }}
                    onClick={() => { updateCard({ dueDate: null }); setCard(prev => prev ? { ...prev, dueDate: null } : prev); }}>
                    Remove due date
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Checklist */}
        {showAddChecklist && (
          <div style={{ position: 'relative', padding: '0 var(--space-6)' }}>
            <div className="popover" style={{ position: 'relative', marginBottom: 'var(--space-3)', minWidth: 200 }}>
              <div className="popover-header"><h4>Add Checklist</h4><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddChecklist(false)}><X size={14} /></button></div>
              <div className="popover-body">
                <input className="input" placeholder="Checklist title" value={newChecklistTitle} onChange={e => setNewChecklistTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addChecklist(); }} autoFocus />
                <button className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={addChecklist}>Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="card-detail-body">
          {/* Main content */}
          <div className="card-detail-main">
            {/* Members Row */}
            {card.members.length > 0 && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Members</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {card.members.map(m => (
                    <div key={m.id} className="avatar" title={m.user?.name || m.agent?.name}
                      style={{ background: m.agent ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: m.agent ? 'white' : 'var(--color-accent)' }}>
                      {m.user ? getInitials(m.user.name) : m.agent ? getInitials(m.agent.name) : '?'}
                    </div>
                  ))}
                  <button className="avatar" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-surface-border)', cursor: 'pointer' }}
                    onClick={() => setShowMemberPicker(true)}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Labels Row */}
            {card.labels.length > 0 && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Labels</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {card.labels.map((label: string) => {
                    const lc = LABEL_COLORS.find(l => l.name === label);
                    return (
                      <span key={label} className="label-pill" style={{ background: lc?.bg || 'var(--color-bg-tertiary)', color: lc?.color || 'var(--color-text-secondary)' }}>
                        {label}
                      </span>
                    );
                  })}
                  <button className="label-pill" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-surface-border)', cursor: 'pointer' }}
                    onClick={() => setShowLabelPicker(true)}>
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Due Date */}
            {card.dueDate && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Due Date</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Clock size={14} style={{ color: new Date(card.dueDate) < new Date() ? 'var(--color-error)' : 'var(--color-accent)' }} />
                  <span className="text-sm" style={{ color: new Date(card.dueDate) < new Date() ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                    {formatDate(card.dueDate)}
                  </span>
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Description</div>
              {editingDesc ? (
                <div>
                  <textarea className="input textarea" value={descValue} onChange={e => setDescValue(e.target.value)}
                    onBlur={handleDescBlur} autoFocus placeholder="Add a more detailed description..." style={{ minHeight: 120 }} />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleDescBlur}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setDescValue(card.description || ''); setEditingDesc(false); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setEditingDesc(true)} style={{ cursor: 'pointer', minHeight: 60, padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', color: descValue ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)', whiteSpace: 'pre-wrap' }}>
                  {descValue || 'Add a more detailed description...'}
                </div>
              )}
            </div>

            {/* Checklists */}
            {card.checklists.map(cl => {
              const progress = getChecklistProgress(cl);
              return (
                <div key={cl.id} style={{ marginBottom: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <CheckSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <span className="form-label" style={{ marginBottom: 0 }}>{cl.title}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteChecklist(cl.id)} style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>Delete</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span className="text-xs text-tertiary">{progress}%</span>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} data-complete={progress === 100 ? 'true' : 'false'} />
                    </div>
                  </div>
                  {cl.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0' }}>
                      <input type="checkbox" className="checkbox" checked={item.isChecked} onChange={() => toggleChecklistItem(cl.id, item.id, item.isChecked)} />
                      <span className="text-sm" style={{ flex: 1, textDecoration: item.isChecked ? 'line-through' : 'none', color: item.isChecked ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
                        {item.content}
                      </span>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteChecklistItem(cl.id, item.id)} style={{ opacity: 0.5 }}><X size={12} /></button>
                    </div>
                  ))}
                  {addingItemTo === cl.id ? (
                    <div style={{ marginTop: 'var(--space-2)' }}>
                      <input className="input" placeholder="Add an item" value={newItemContent} onChange={e => setNewItemContent(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') addChecklistItem(cl.id); if (e.key === 'Escape') { setAddingItemTo(null); setNewItemContent(''); } }} />
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => addChecklistItem(cl.id)}>Add</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setAddingItemTo(null); setNewItemContent(''); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-1)' }} onClick={() => { setAddingItemTo(cl.id); setNewItemContent(''); }}>
                      <Plus size={14} />Add an item
                    </button>
                  )}
                </div>
              );
            })}

            {/* Subtasks */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <CheckSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                  <span className="form-label" style={{ marginBottom: 0 }}>
                    Subtasks {card.subtasks.length > 0 && (
                      <span className="text-tertiary text-xs" style={{ marginLeft: 'var(--space-2)' }}>
                        {card.subtasks.filter(s => /done|shipped|complete/i.test(s.column?.name || '')).length}/{card.subtasks.length} done
                      </span>
                    )}
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingSubtask(true)}>
                  <Plus size={12} /> Add subtask
                </button>
              </div>
              {card.subtasks.length === 0 && !addingSubtask && (
                <div className="text-tertiary text-xs" style={{ padding: 'var(--space-2) 0' }}>
                  Break this task into smaller pieces assignable to specific people or agents.
                </div>
              )}
              {card.subtasks.map(st => {
                const done = /done|shipped|complete/i.test(st.column?.name || '');
                const assigneeName = st.assigneeUser?.name || st.assigneeAgent?.name;
                const isAgentAssignee = !!st.assigneeAgent;
                return (
                  <div key={st.id} className="glass-card" style={{ padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', position: 'relative' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: st.column?.color || 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <span className="text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
                      {st.title}
                    </span>
                    {st.column?.name && (
                      <span className="text-xs text-tertiary" style={{ padding: '1px 6px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                        {st.column.name}
                      </span>
                    )}
                    <button
                      className="subtask-assignee-trigger"
                      onClick={() => setSubtaskAssigneePickerFor(subtaskAssigneePickerFor === st.id ? null : st.id)}
                      title={assigneeName || 'Assign'}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    >
                      {assigneeName ? (
                        <div className="avatar avatar-sm" style={{ background: isAgentAssignee ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: isAgentAssignee ? 'white' : 'var(--color-accent)', fontSize: 10 }}>
                          {getInitials(assigneeName)}
                        </div>
                      ) : (
                        <div className="avatar avatar-sm" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-surface-border)', fontSize: 10 }}>
                          <Plus size={10} />
                        </div>
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        onClose();
                        window.history.pushState(null, '', `?card=${st.id}`);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      title="Open subtask"
                      style={{ padding: '2px 6px', fontSize: 'var(--font-size-xs)' }}
                    >
                      Open
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteSubtask(st.id)} style={{ opacity: 0.5 }}><X size={12} /></button>

                    {subtaskAssigneePickerFor === st.id && (
                      <div className="popover" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10, minWidth: 220, maxHeight: 240, overflow: 'auto' }}>
                        <div className="popover-header">
                          <h4>Assign subtask</h4>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSubtaskAssigneePickerFor(null)}><X size={12} /></button>
                        </div>
                        <div className="popover-body">
                          {(st.assigneeUser || st.assigneeAgent) && (
                            <div className="popover-item" onClick={() => assignSubtask(st.id, undefined, undefined)}>
                              <span className="text-tertiary text-xs">Clear assignee</span>
                            </div>
                          )}
                          {team.users.map(u => (
                            <div key={u.id} className={`popover-item ${st.assigneeUser?.id === u.id ? 'selected' : ''}`} onClick={() => assignSubtask(st.id, u.id)}>
                              <div className="avatar avatar-sm" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>{getInitials(u.name)}</div>
                              <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{u.name}</div></div>
                              {st.assigneeUser?.id === u.id && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                            </div>
                          ))}
                          {team.agents.map(a => (
                            <div key={a.id} className={`popover-item ${st.assigneeAgent?.id === a.id ? 'selected' : ''}`} onClick={() => assignSubtask(st.id, undefined, a.id)}>
                              <div className="avatar avatar-sm" style={{ background: 'var(--color-role-cto)', color: 'white' }}>{getInitials(a.name)}</div>
                              <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{a.name}</div><div className="text-tertiary text-xs">{a.roleLabel}</div></div>
                              {st.assigneeAgent?.id === a.id && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {addingSubtask && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <input
                    className="input"
                    placeholder="Subtask title"
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSubtask();
                      if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskTitle(''); }
                    }}
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button className="btn btn-primary btn-sm" onClick={addSubtask}>Add</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setAddingSubtask(false); setNewSubtaskTitle(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
            {card.attachments.length > 0 && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div className="form-label" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Paperclip size={14} /> Attachments
                </div>
                {/* Image previews grid */}
                {card.attachments.filter(a => a.mimeType?.startsWith('image')).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                    {card.attachments.filter(a => a.mimeType?.startsWith('image')).map(att => (
                      <div key={att.id} onClick={() => setLightbox({ url: att.url, name: att.name })}
                           style={{ position: 'relative', display: 'block', aspectRatio: '4 / 3', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-surface-border)', background: 'var(--color-bg-tertiary)', cursor: 'zoom-in' }}>
                        <img src={att.url} alt={att.name}
                             style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button onClick={(e) => { e.stopPropagation(); deleteAttachment(att.id); }}
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                                title="Remove">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Non-image files list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {card.attachments.filter(a => !a.mimeType?.startsWith('image')).map(att => (
                    <div key={att.id} className="file-chip" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                        <FileText size={14} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                        {att.size && <span className="text-tertiary">({formatSize(att.size)})</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                        {att.url.startsWith('data:') ? null : (
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm"><Download size={12} /></a>
                        )}
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteAttachment(att.id)}><X size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Comments & Activity */}
          <div className="card-detail-sidebar">
            {projectId && (
              <CardCodePanel
                cardId={card.id}
                projectId={projectId}
                hasAgentAssigned={!!card.assigneeAgentId}
              />
            )}
            <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
              <button className={`tab ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}><MessageSquare size={14} /> Comments</span>
              </button>
              <button className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                Activity
              </button>
            </div>

            {/* Comment input */}
            <div style={{ marginBottom: 'var(--space-4)', position: 'relative' }}>
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-1) var(--space-2)', marginBottom: 'var(--space-1)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  <span>Replying to <strong>{replyTo.authorName}</strong></span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={12} /></button>
                </div>
              )}
              {projectId ? (
                <RichComposer
                  ref={commentComposerRef}
                  projectId={projectId}
                  placeholder={replyTo ? `Reply to ${replyTo.authorName}...` : 'Write a comment...'}
                  className="input textarea"
                  hydrate={hydrateCardKeys}
                  mentionSuggestions={commentMentionSuggestions}
                  onChange={(md) => setNewComment(md)}
                  onSubmit={() => addComment()}
                />
              ) : (
                <textarea className="input textarea" placeholder="Write a comment..." value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                  style={{ minHeight: 72, fontSize: 'var(--font-size-sm)' }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" onClick={addComment} disabled={!newComment.trim()}>Send</button>
              </div>
            </div>

            {activeTab === 'comments' ? (() => {
              const roots = comments.filter(c => !c.parentCommentId);
              const repliesByParent: Record<string, CommentData[]> = {};
              for (const c of comments) {
                if (c.parentCommentId) (repliesByParent[c.parentCommentId] ||= []).push(c);
              }
              // Replies oldest-first within a thread
              for (const k of Object.keys(repliesByParent)) repliesByParent[k].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

              const renderOne = (c: CommentData, isReply = false) => {
                const isAgent = c.authorType === 'agent';
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <div className="avatar avatar-sm" style={{ background: isAgent ? 'var(--color-role-cto)' : 'var(--color-accent-muted)', color: isAgent ? 'white' : 'var(--color-accent)' }}>
                      {c.author ? getInitials(c.author.name) : '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <span className="text-sm" style={{ fontWeight: 'var(--font-weight-semibold)' }}>{c.author?.name || (isAgent ? 'Agent' : 'Unknown')}</span>
                        {isAgent && <span className="text-xs text-tertiary" style={{ padding: '1px 6px', background: 'var(--color-role-cto)', color: 'white', borderRadius: 'var(--radius-sm)', fontSize: 10 }}>AI{c.author?.role ? ` · ${c.author.role}` : ''}</span>}
                        <span className="text-xs text-tertiary">{formatTime(c.createdAt)}</span>
                      </div>
                      <div className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)', lineHeight: 'var(--line-height-relaxed)', whiteSpace: 'pre-wrap' }}>
                        {projectId
                          ? <MessageBody text={c.content} projectId={projectId} />
                          : c.content}
                      </div>
                      {!isReply && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-1)', padding: '2px 6px', fontSize: 'var(--font-size-xs)' }}
                          onClick={() => { setReplyTo({ id: c.id, authorName: c.author?.name || 'Comment' }); commentComposerRef.current?.focus(); }}>
                          Reply
                        </button>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {roots.length === 0 && <div className="text-tertiary text-sm">No comments yet</div>}
                  {roots.map(c => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {renderOne(c)}
                      {(repliesByParent[c.id] || []).length > 0 && (
                        <div style={{ marginLeft: 'var(--space-6)', borderLeft: '2px solid var(--color-surface-border)', paddingLeft: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {repliesByParent[c.id].map(r => renderOne(r, true))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activities.length === 0 && <div className="text-tertiary text-sm">No activity yet</div>}
                {activities.map(a => (
                  <div key={a.id} className="activity-item">
                    <div className="activity-dot" />
                    <div>
                      <div className="activity-text">{a.content}</div>
                      <div className="activity-time">{formatTime(a.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)', cursor: 'zoom-out' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="btn btn-ghost btn-icon"
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.6)', color: '#fff', width: 40, height: 40 }}
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', cursor: 'default' }}
          />
        </div>
      )}
    </div>
  );
}
