import { useCallback, useEffect, useState } from 'react';
import {
  DRAFT_STORAGE_KEY,
  createDraftState,
  readStoredDraft,
  type DraftState,
} from './model';

export function createDraftFromTemplate(
  type: DraftState['type'],
  current: Pick<DraftState, 'title' | 'query'>,
): DraftState {
  return createDraftState(type, {
    title: current.title,
    query: current.query,
  });
}

export function useOpportunityDraftState(defaultType: DraftState['type'] = 'relay_chain') {
  const [draft, setDraft] = useState<DraftState>(() => readStoredDraft() || createDraftState(defaultType));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const applyDraftTemplate = useCallback((type: DraftState['type']) => {
    setDraft((current) => createDraftFromTemplate(type, current));
  }, []);

  const resetDraft = useCallback((type: DraftState['type'] = defaultType) => {
    setDraft(createDraftState(type));
  }, [defaultType]);

  return {
    draft,
    setDraft,
    applyDraftTemplate,
    resetDraft,
  };
}
