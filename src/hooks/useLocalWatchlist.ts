import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATALOG_BY_ID } from '@/src/data/catalog';
import type { MediaItem } from '@/src/types/media';

const WATCHLIST_ITEMS_KEY = 'moviesx_watchlist_items_v2';
const HISTORY_ITEMS_KEY = 'moviesx_history_items_v2';
const LEGACY_WATCHLIST_IDS_KEY = 'moviesx_watchlist_v1';
const LEGACY_HISTORY_IDS_KEY = 'moviesx_history_v1';
const MAX_HISTORY = 30;

function readItems(key: string, legacyKey: string): MediaItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is MediaItem =>
            Boolean(item && typeof item === 'object' && item.id !== undefined && item.title),
        );
      }
    }

    // Migrate legacy ID-only storage if present
    const legacyRaw = window.localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const legacyIds = JSON.parse(legacyRaw);
      if (Array.isArray(legacyIds)) {
        return legacyIds
          .map((id) => (typeof id === 'number' ? CATALOG_BY_ID[id] : undefined))
          .filter((item): item is MediaItem => Boolean(item));
      }
    }
    return [];
  } catch {
    return [];
  }
}

function writeItems(key: string, items: MediaItem[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}

export function useLocalWatchlist() {
  const [watchlistItems, setWatchlistItems] = useState<MediaItem[]>(() =>
    readItems(WATCHLIST_ITEMS_KEY, LEGACY_WATCHLIST_IDS_KEY),
  );
  const [historyItems, setHistoryItems] = useState<MediaItem[]>(() =>
    readItems(HISTORY_ITEMS_KEY, LEGACY_HISTORY_IDS_KEY),
  );

  useEffect(() => {
    writeItems(WATCHLIST_ITEMS_KEY, watchlistItems);
  }, [watchlistItems]);

  useEffect(() => {
    writeItems(HISTORY_ITEMS_KEY, historyItems);
  }, [historyItems]);

  const watchlistIdSet = useMemo(
    () => new Set(watchlistItems.map((item) => String(item.id))),
    [watchlistItems],
  );

  const isInWatchlist = useCallback(
    (id: number | string) => watchlistIdSet.has(String(id)),
    [watchlistIdSet],
  );

  const toggleWatchlist = useCallback((item: MediaItem) => {
    const targetId = String(item.id);
    setWatchlistItems((prev) => {
      const exists = prev.some((entry) => String(entry.id) === targetId);
      if (exists) {
        return prev.filter((entry) => String(entry.id) !== targetId);
      }
      return [item, ...prev];
    });
  }, []);

  const removeFromWatchlist = useCallback((id: number | string) => {
    const targetId = String(id);
    setWatchlistItems((prev) => prev.filter((entry) => String(entry.id) !== targetId));
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchlistItems([]);
  }, []);

  const recordWatch = useCallback((item: MediaItem) => {
    const targetId = String(item.id);
    setHistoryItems((prev) =>
      [item, ...prev.filter((entry) => String(entry.id) !== targetId)].slice(0, MAX_HISTORY),
    );
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryItems([]);
  }, []);

  return {
    watchlistItems,
    historyItems,
    watchlistCount: watchlistItems.length,
    isInWatchlist,
    toggleWatchlist,
    removeFromWatchlist,
    clearWatchlist,
    recordWatch,
    clearHistory,
  };
}
