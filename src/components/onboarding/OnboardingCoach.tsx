'use client';
/* eslint-disable react-hooks/set-state-in-effect -- this component synchronizes
   localStorage-backed step state with the DOM (highlight rectangle on the
   current step's target). The recommended "derive from state" pattern would
   require a second render to clear stale outlines mid-step; calling setState
   synchronously inside the effect is the correctness-preserving choice. */

// Lightweight in-app coach. No popover library, no portal mounted in document.
// We render a fixed-position card that either highlights an element by querying
// for [data-coach-target=...] and drawing an outline near it, or floats in the
// bottom-right as a generic tip when the target is missing.
//
// Activation: only when the user is on the demo project AND localStorage hasn't
// recorded `coop:onboarding:done`. The coach itself is stateless beyond the
// active step index — it reads/writes localStorage directly so dismissals
// survive page reloads and the user can't double-fire steps.

import { useEffect, useState, useCallback } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';
import type { CoachStep } from '@/lib/onboarding/demoContent';

const DONE_KEY = 'coop:onboarding:done';
const STEP_KEY = 'coop:onboarding:step';

interface Props {
  steps: CoachStep[];
  /** Project id of the demo project — coach only shows when active matches. */
  demoProjectId: string;
  /** Project id of the route the user is currently on (from layout). */
  currentProjectId: string;
}

export default function OnboardingCoach({ steps, demoProjectId, currentProjectId }: Props) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  // Initial mount — decide whether to show, and which step.
  useEffect(() => {
    if (currentProjectId !== demoProjectId) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DONE_KEY)) return;
    const stored = window.localStorage.getItem(STEP_KEY);
    const idx = stored ? parseInt(stored, 10) : 0;
    if (Number.isNaN(idx) || idx < 0 || idx >= steps.length) {
      setStepIndex(0);
    } else {
      setStepIndex(idx);
    }
  }, [demoProjectId, currentProjectId, steps.length]);

  const step = stepIndex !== null ? steps[stepIndex] : null;

  // Track highlighted element on each step change + on resize. We re-query on
  // every layout-affecting tick so route transitions / sidebar collapses don't
  // strand the outline at a stale position.
  useEffect(() => {
    if (!step?.target) { setHighlightRect(null); return; }
    const measure = () => {
      const el = document.querySelector(step.target!);
      setHighlightRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const t = setInterval(measure, 800); // catch async UI changes (drawer opens etc.)
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(t);
    };
  }, [step]);

  const next = useCallback(() => {
    if (stepIndex === null) return;
    if (stepIndex + 1 >= steps.length) {
      window.localStorage.setItem(DONE_KEY, '1');
      window.localStorage.removeItem(STEP_KEY);
      setStepIndex(null);
    } else {
      const n = stepIndex + 1;
      window.localStorage.setItem(STEP_KEY, String(n));
      setStepIndex(n);
    }
  }, [stepIndex, steps.length]);

  const dismissAll = useCallback(() => {
    window.localStorage.setItem(DONE_KEY, '1');
    window.localStorage.removeItem(STEP_KEY);
    setStepIndex(null);
  }, []);

  if (step === null || stepIndex === null) return null;

  // The card sits bottom-right if no target rect, or anchored under the rect
  // (offset by 12px) when one is available. We clamp so it never falls off
  // screen on small viewports.
  const cardTop = highlightRect
    ? Math.min(highlightRect.bottom + 12, window.innerHeight - 200)
    : window.innerHeight - 220;
  const cardLeft = highlightRect
    ? Math.min(Math.max(highlightRect.left, 12), window.innerWidth - 332)
    : window.innerWidth - 332;

  return (
    <>
      {highlightRect && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: highlightRect.top - 6,
            left: highlightRect.left - 6,
            width: highlightRect.width + 12,
            height: highlightRect.height + 12,
            border: '2px solid var(--color-accent)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            transition: 'all 220ms ease',
            zIndex: 9000,
          }}
        />
      )}
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: 'fixed',
          top: cardTop,
          left: cardLeft,
          width: 320,
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,217,146,0.2)',
          zIndex: 9001,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
          <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>{step.title}</div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={dismissAll}
            title="Skip the tour — won't show again"
            style={{ marginRight: -4, marginTop: -4 }}
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-secondary text-sm" style={{ margin: '0 0 var(--space-3) 0' }}>{step.body}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-xs text-tertiary">Step {stepIndex + 1} of {steps.length}</span>
          <button className="btn btn-primary btn-sm" onClick={next}>
            {stepIndex + 1 === steps.length ? (<>Got it <Check size={12} /></>) : (<>Next <ChevronRight size={12} /></>)}
          </button>
        </div>
      </div>
    </>
  );
}
