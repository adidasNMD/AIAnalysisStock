import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpportunitySummary } from '../../api';
import {
  isEditableTarget,
  type InboxLane,
  type OpportunityPrimaryAction,
} from './model';

type LanePrimaryTarget = {
  opportunity: OpportunitySummary;
  action: OpportunityPrimaryAction;
} | null;

export function useWorkbenchLiveNow(intervalMs = 15000) {
  const [liveNow, setLiveNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNow(Date.now());
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return liveNow;
}

export function laneFromWorkbenchShortcutKey(key: string): InboxLane | null {
  if (key === '1') return 'act';
  if (key === '2') return 'review';
  if (key === '3') return 'monitor';
  return null;
}

interface WorkbenchLaneFocusOptions {
  focusDurationMs?: number;
}

export function useWorkbenchLaneFocus({
  focusDurationMs = 2400,
}: WorkbenchLaneFocusOptions = {}) {
  const [focusedLane, setFocusedLane] = useState<InboxLane | null>(null);
  const laneFocusTimeoutRef = useRef<number | null>(null);
  const laneRefs = useRef<Record<InboxLane, HTMLElement | null>>({
    act: null,
    review: null,
    monitor: null,
  });

  const clearLaneFocusTimeout = useCallback(() => {
    if (laneFocusTimeoutRef.current) {
      window.clearTimeout(laneFocusTimeoutRef.current);
      laneFocusTimeoutRef.current = null;
    }
  }, []);

  const focusLane = useCallback((lane?: InboxLane | null) => {
    if (!lane) return;
    setFocusedLane(lane);
    clearLaneFocusTimeout();
    laneFocusTimeoutRef.current = window.setTimeout(() => {
      setFocusedLane((current) => (current === lane ? null : current));
      laneFocusTimeoutRef.current = null;
    }, focusDurationMs);
    laneRefs.current[lane]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [clearLaneFocusTimeout, focusDurationMs]);

  const setLaneRef = useCallback((lane: InboxLane, node: HTMLElement | null) => {
    laneRefs.current[lane] = node;
  }, []);

  useEffect(() => clearLaneFocusTimeout, [clearLaneFocusTimeout]);

  return {
    focusedLane,
    focusLane,
    setLaneRef,
  };
}

interface WorkbenchLaneKeyboardShortcutOptions {
  focusLane: (lane: InboxLane) => void;
  resolveLanePrimaryTarget: (lane: InboxLane) => LanePrimaryTarget;
  executePrimaryAction: (
    opportunity: OpportunitySummary,
    action: OpportunityPrimaryAction,
  ) => Promise<void>;
}

export function useWorkbenchLaneKeyboardShortcuts({
  focusLane,
  resolveLanePrimaryTarget,
  executePrimaryAction,
}: WorkbenchLaneKeyboardShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const lane = laneFromWorkbenchShortcutKey(event.key);
      if (!lane) return;

      event.preventDefault();
      if (!event.shiftKey) {
        focusLane(lane);
        return;
      }

      const target = resolveLanePrimaryTarget(lane);
      if (!target) return;
      void executePrimaryAction(target.opportunity, target.action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executePrimaryAction, focusLane, resolveLanePrimaryTarget]);
}
