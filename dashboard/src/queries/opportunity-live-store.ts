import { useCallback, useEffect, useState } from 'react';
import type {
  OpportunityBoardHealthMap,
  OpportunityInboxItem,
  OpportunitySummary,
} from '../api';
import {
  mergeInboxItem,
  mergeOpportunitySummary,
} from '../pages/opportunity-workbench/live';
import { mergeSnapshotPreservingFresh } from './query-client';

export function mergeLiveInboxSnapshot(
  current: OpportunityInboxItem[],
  snapshot: OpportunityInboxItem[],
  limit: number,
): OpportunityInboxItem[] {
  return mergeSnapshotPreservingFresh(current, snapshot, limit);
}

export function mergeLiveOpportunitySnapshot(
  current: OpportunitySummary[],
  snapshot: OpportunitySummary[],
  limit: number,
): OpportunitySummary[] {
  return mergeSnapshotPreservingFresh(current, snapshot, limit);
}

export function removeLiveInboxItem(current: OpportunityInboxItem[], id: string): OpportunityInboxItem[] {
  return current.filter((item) => item.id !== id);
}

export interface OpportunityLiveStoreOptions {
  inboxSnapshot?: OpportunityInboxItem[] | null;
  opportunitySnapshot?: OpportunitySummary[] | null;
  boardHealthSnapshot?: OpportunityBoardHealthMap | null;
  inboxLimit: number;
  opportunityLimit: number;
}

export function useOpportunityLiveStore({
  inboxSnapshot,
  opportunitySnapshot,
  boardHealthSnapshot,
  inboxLimit,
  opportunityLimit,
}: OpportunityLiveStoreOptions) {
  const [liveInbox, setLiveInbox] = useState<OpportunityInboxItem[]>([]);
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunitySummary[]>([]);
  const [liveBoardHealth, setLiveBoardHealth] = useState<OpportunityBoardHealthMap | null>(null);

  useEffect(() => {
    if (inboxSnapshot) {
      setLiveInbox((current) => mergeLiveInboxSnapshot(current, inboxSnapshot, inboxLimit));
    }
  }, [inboxLimit, inboxSnapshot]);

  useEffect(() => {
    if (opportunitySnapshot) {
      setLiveOpportunities((current) => (
        mergeLiveOpportunitySnapshot(current, opportunitySnapshot, opportunityLimit)
      ));
    }
  }, [opportunityLimit, opportunitySnapshot]);

  useEffect(() => {
    if (boardHealthSnapshot) {
      setLiveBoardHealth(boardHealthSnapshot);
    }
  }, [boardHealthSnapshot]);

  const upsertInboxItem = useCallback((item: OpportunityInboxItem | null) => {
    setLiveInbox((current) => mergeInboxItem(current, item, inboxLimit));
  }, [inboxLimit]);

  const removeInboxItem = useCallback((id: string) => {
    setLiveInbox((current) => removeLiveInboxItem(current, id));
  }, []);

  const upsertOpportunity = useCallback((item: OpportunitySummary | null) => {
    setLiveOpportunities((current) => mergeOpportunitySummary(current, item, opportunityLimit));
  }, [opportunityLimit]);

  return {
    liveInbox,
    liveOpportunities,
    liveBoardHealth,
    setLiveBoardHealth,
    upsertInboxItem,
    removeInboxItem,
    upsertOpportunity,
  };
}
