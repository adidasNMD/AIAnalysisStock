import { useCallback, useEffect, useState } from 'react';
import {
  createDraftState,
  readStoredDraft,
  writeStoredDraft,
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
    writeStoredDraft(draft);
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
