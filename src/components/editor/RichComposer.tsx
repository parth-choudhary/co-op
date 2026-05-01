'use client';

// TipTap-based composer used by both the chat input and the card-comment input.
// Renders a contenteditable surface with:
//   - card mention pills (paste URL, paste KEY+space, type KEY+space)
//   - @-mention picker driven by parent-supplied suggestion list
//   - basic marks (bold/italic/code) via standard markdown shortcuts
//   - Enter to submit; Shift+Enter for newline
//
// The parent owns submit semantics. We expose:
//   - `onChange(markdown, hasContent)` — called on every doc change
//   - `value` — initial content (markdown). Component is uncontrolled internally.
//   - `submit()` ref handle for "send" buttons that live outside the editor

import {
  useEditor, EditorContent, ReactRenderer,
  type Editor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import tippy, { type Instance as TippyInstance, type Props as TippyProps } from 'tippy.js';

// Named key for the @-mention suggestion plugin so the editor's keydown handler
// can ask "is the popover open right now?" before deciding to claim Enter as
// submit. Without a named key TipTap creates an anonymous one and we have no
// way to look up its state.
const MentionSuggestionKey = new PluginKey('@coop/mentionSuggestion');

import { CardMention } from './CardMention';
import { CardMentionRules, type HydrateFn } from './cardInputRules';
import { EmojiInputRule } from './emojiInputRule';
import { serializeDocToMarkdown, docHasContent } from './markdownSerializer';
import MentionList, { type MentionItem, type MentionListHandle } from './MentionList';

export interface RichComposerHandle {
  /** Programmatic focus. */
  focus: () => void;
  /** Clear the editor content. */
  clear: () => void;
  /** Insert text at the cursor. */
  insertText: (text: string) => void;
}

interface Props {
  projectId: string;
  /** Initial body. Plain text or empty for a fresh composer. */
  initialValue?: string;
  /** Fired on every change with serialized markdown + a non-empty flag. */
  onChange: (markdown: string, hasContent: boolean) => void;
  /** Fired when the user presses Enter (no shift). Parent should call clear(). */
  onSubmit: () => void;
  /** Fired on every keystroke — parent uses for typing notifications. */
  onTyping?: () => void;
  /** Async hydrator for card pill metadata. */
  hydrate: HydrateFn;
  /** Suggestion list source for @-mentions. Called on every query change. */
  mentionSuggestions: (query: string) => MentionItem[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

const RichComposer = forwardRef<RichComposerHandle, Props>(({
  projectId, initialValue, onChange, onSubmit, onTyping,
  hydrate, mentionSuggestions, placeholder, className, autoFocus,
}, ref) => {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const editor = useEditor({
    // Required for Next.js / SSR: defer the first render until mount so the
    // server-rendered HTML matches what the client produces (TipTap >=2.5).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false, codeBlock: false }),
      Placeholder.configure({ placeholder: placeholder || '' }),
      CardMention,
      CardMentionRules.configure({ projectId, hydrate }),
      EmojiInputRule,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderText: ({ node }) => '@' + String(node.attrs.label || node.attrs.id || '').replace(/\s+/g, '_'),
        suggestion: { ...makeMentionSuggestion(mentionSuggestions), pluginKey: MentionSuggestionKey },
      }),
    ],
    content: initialValue ? plainToInitialDoc(initialValue) : '',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'rich-composer-content',
      },
      handleKeyDown: (view, event) => {
        // Parent typing pulse (debounced upstream).
        if (event.key.length === 1 || event.key === 'Backspace') {
          onTyping?.();
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          // ProseMirror calls editorProps.handleKeyDown BEFORE plugin keydowns,
          // which means the mention popover never gets to claim Enter unless we
          // explicitly check its state and step aside. Without this guard,
          // pressing Enter to pick a mention sends the message instead.
          const mentionState = MentionSuggestionKey.getState(view.state) as { active?: boolean } | undefined;
          if (mentionState?.active) return false;
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const md = serializeDocToMarkdown(json);
      onChange(md, docHasContent(json));
    },
  });

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus('end'),
    clear: () => editor?.commands.clearContent(true),
    insertText: (text) => editor?.commands.insertContent(text),
  }), [editor]);

  // Re-init content if initialValue changes externally (rare — parent usually
  // resets via clear() after submit). Avoids stale content if the modal is
  // re-opened with a different draft.
  useEffect(() => {
    if (!editor) return;
    if (typeof initialValue !== 'string') return;
    const current = serializeDocToMarkdown(editor.getJSON());
    if (current === initialValue) return;
    editor.commands.setContent(plainToInitialDoc(initialValue), { emitUpdate: false });
  }, [initialValue, editor]);

  // The `rich-composer-shell` class is non-negotiable — it's what makes the
  // inner ProseMirror contenteditable stretch to fill this wrapper so clicks
  // anywhere inside (not just on existing text) focus the editor.
  return <EditorContent editor={editor} className={`rich-composer-shell${className ? ` ${className}` : ''}`} />;
});
RichComposer.displayName = 'RichComposer';

export default RichComposer;

// ---------------------------------------------------------------------------

/** Build TipTap suggestion config that mounts our MentionList component as a
 *  tippy popover. Bridges the parent's suggestion source to TipTap's API. */
function makeMentionSuggestion(getItems: (query: string) => MentionItem[]) {
  return {
    items: ({ query }: { query: string }) => getItems(query).slice(0, 8),

    render: () => {
      let component: ReactRenderer<MentionListHandle> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          });
          if (!props.clientRect) return;
          const tippyProps: Partial<TippyProps> = {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'top-start',
            theme: 'mention',
          };
          popup = tippy(document.body, tippyProps as any);
        },
        onUpdate: (props: any) => {
          component?.updateProps({ items: props.items, command: props.command });
          if (props.clientRect) {
            popup?.setProps({ getReferenceClientRect: props.clientRect as any });
          }
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props.event) || false;
        },
        onExit: () => {
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}

/** Wrap a plain string into a TipTap doc with one paragraph. For the few
 *  contexts where we re-mount the composer with prior content. We do NOT try
 *  to parse markdown back into pills — the editor is for new input. */
function plainToInitialDoc(text: string): any {
  if (!text) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

export type { MentionItem };
