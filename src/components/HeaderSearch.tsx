import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  Film,
  Loader2,
  Play,
  Search,
  Star,
} from 'lucide-react';
import { searchAnimeCatalog, searchTmdbMulti } from '@/src/services/api';
import type { MediaItem, MediaType } from '@/src/types/media';

type FilterScope = 'all' | MediaType;

const SEARCH_HISTORY_KEY = 'app_search_history';
const ACCORDION_TRANSITION = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

function saveSearchTerm(term: string): string[] {
  const clean = term.trim();
  if (!clean) return readSearchHistory();
  try {
    const next = [clean, ...readSearchHistory().filter((s) => s !== clean)].slice(0, 3);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readSearchHistory();
  }
}

interface SearchResultRowProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onClose: () => void;
}

const SearchResultRow: React.FC<SearchResultRowProps> = ({
  item,
  onPlay,
  onSelect,
  onClose,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const typeLabel =
    item.mediaType === 'movie'
      ? 'Movie'
      : item.mediaType === 'tv'
        ? 'Show'
        : 'Anime';
  const year = item.year && item.year > 1900 ? item.year : null;
  const rating = typeof item.rating === 'number' && item.rating > 0 ? item.rating : null;
  const firstGenre = item.genres[0] || null;

  return (
    <div
      className={`rounded-[8px] transition-colors ${
        expanded ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-2.5 py-2 text-left"
      >
        <div className="w-9 h-12 flex-shrink-0 rounded-[4px] overflow-hidden bg-white/5 flex items-center justify-center">
          {!imgBroken && item.posterUrl ? (
            <img
              src={item.posterUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={() => setImgBroken(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <Film className="w-4 h-4 text-[#8c8c8c]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-white truncate">{item.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[12px] text-[#8c8c8c] whitespace-nowrap">
            <span className="shrink-0">{typeLabel}</span>
            {year && (
              <>
                <span className="shrink-0 text-white/20" aria-hidden="true">
                  ·
                </span>
                <span className="shrink-0 tabular-nums">{year}</span>
              </>
            )}
            {rating !== null && (
              <>
                <span className="shrink-0 text-white/20" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <Star className="w-2.5 h-2.5 text-white/80 fill-white/80" />
                  <span className="tabular-nums">{rating.toFixed(1)}</span>
                </span>
              </>
            )}
            {firstGenre && (
              <>
                <span className="shrink-0 text-white/20" aria-hidden="true">
                  ·
                </span>
                <span className="min-w-0 truncate">{firstGenre}</span>
              </>
            )}
          </p>
        </div>

        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-white/35 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={ACCORDION_TRANSITION}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5 pt-0.5">
              {item.description && (
                <p className="mb-3 text-[12px] leading-relaxed text-[#b3b3b3] line-clamp-3">
                  {item.description}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPlay(item);
                  }}
                  className="mv-btn mv-btn--primary mv-btn--sm !h-8 !px-3"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelect(item);
                  }}
                  className="mv-btn mv-btn--secondary mv-btn--sm !h-8 !px-3"
                >
                  <span>See more</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface HeaderSearchProps {
  onClose: () => void;
  panelHostRef: React.RefObject<HTMLElement | null>;
  panelVisible?: boolean;
  panelPlacement?: 'below' | 'above';
  autoFocusDelay?: number;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
}

const SCOPE_TABS: { value: FilterScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Shows' },
  { value: 'anime', label: 'Anime' },
];

export const HeaderSearch: React.FC<HeaderSearchProps> = ({
  onClose,
  panelHostRef,
  panelVisible = true,
  panelPlacement = 'below',
  autoFocusDelay = 60,
  onPlay,
  onSelect,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scope, setScope] = useState<FilterScope>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readSearchHistory());
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);

  const [results, setResults] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setPortalTarget(panelHostRef.current);
  }, [panelHostRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), autoFocusDelay);
    return () => window.clearTimeout(timer);
  }, [autoFocusDelay]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 320);
    return () => window.clearTimeout(t);
  }, [query]);

  // Run live global search whenever debouncedQuery or scope changes
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setPage(1);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        setRecentSearches(saveSearchTerm(debouncedQuery));

        if (scope === 'anime') {
          const animeRes = await searchAnimeCatalog(debouncedQuery, 1, controller.signal);
          if (!controller.signal.aborted) {
            setResults(animeRes.items);
            setPage(animeRes.page);
            setTotalPages(animeRes.totalPages);
          }
        } else if (scope === 'movie' || scope === 'tv') {
          const tmdbRes = await searchTmdbMulti(debouncedQuery, 1, scope, controller.signal);
          if (!controller.signal.aborted) {
            setResults(tmdbRes.items);
            setPage(tmdbRes.page);
            setTotalPages(tmdbRes.totalPages);
          }
        } else {
          const [tmdbRes, animeRes] = await Promise.all([
            searchTmdbMulti(debouncedQuery, 1, 'all', controller.signal).catch(() => ({
              items: [] as MediaItem[],
              page: 1,
              totalPages: 1,
              totalResults: 0,
            })),
            searchAnimeCatalog(debouncedQuery, 1, controller.signal).catch(() => ({
              items: [] as MediaItem[],
              page: 1,
              totalPages: 1,
              totalResults: 0,
            })),
          ]);

          if (controller.signal.aborted) return;

          const combined: MediaItem[] = [];
          const seen = new Set<string>();
          const maxLen = Math.max(tmdbRes.items.length, Math.min(animeRes.items.length, 8));
          for (let i = 0; i < maxLen; i += 1) {
            const tItem = tmdbRes.items[i];
            if (tItem && !seen.has(String(tItem.id))) {
              seen.add(String(tItem.id));
              combined.push(tItem);
            }
            if (i < 8) {
              const aItem = animeRes.items[i];
              if (aItem && !seen.has(String(aItem.id))) {
                seen.add(String(aItem.id));
                combined.push(aItem);
              }
            }
          }
          setResults(combined);
          setPage(1);
          setTotalPages(tmdbRes.totalPages);
        }
      } catch {
        // Ignore aborts
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, scope]);

  // Infinite scroll inside .mv-panel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !debouncedQuery || page >= totalPages || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || loadingMore || page >= totalPages) return;
        const nextPage = page + 1;
        setLoadingMore(true);
        const loader =
          scope === 'anime'
            ? searchAnimeCatalog(debouncedQuery, nextPage)
            : searchTmdbMulti(debouncedQuery, nextPage, scope === 'all' ? 'all' : scope);

        loader
          .then((nextRes) => {
            setResults((prev) => {
              const seen = new Set(prev.map((i) => `${i.mediaType}-${i.id}`));
              const additions = nextRes.items.filter(
                (i) => !seen.has(`${i.mediaType}-${i.id}`),
              );
              return [...prev, ...additions];
            });
            setPage(nextRes.page);
            setTotalPages(nextRes.totalPages);
          })
          .catch(() => {})
          .finally(() => setLoadingMore(false));
      },
      { root, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [debouncedQuery, page, totalPages, loadingMore, scope, results.length]);

  const hasQuery = Boolean(debouncedQuery);
  const showRecent = !hasQuery && !query.trim() && recentSearches.length > 0;
  const panelOpen = useMemo(
    () => panelVisible && (showRecent || query.trim().length > 0),
    [panelVisible, showRecent, query],
  );

  const isTypingDebounce = query.trim().length > 0 && query.trim() !== debouncedQuery;
  const showInitialSpinner = (loading || isTypingDebounce) && !loadingMore;

  // Original Movy ResizeObserver height measurement for smooth dropdown reveal
  useEffect(() => {
    if (!panelOpen) {
      setPanelHeight(0);
      return;
    }
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const measure = () => {
      const cap = Math.min(0.7 * window.innerHeight, 440);
      setPanelHeight(Math.min(contentEl.scrollHeight, cap));
    };

    const ro = new ResizeObserver(measure);
    ro.observe(contentEl);
    measure();
    return () => ro.disconnect();
  }, [panelOpen, results.length, recentSearches.length, hasQuery, showInitialSpinner, scope]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies, shows, and anime"
        aria-label="Search"
        className="w-full h-10 bg-transparent text-[16px] md:text-[13px] text-white placeholder:text-[#8c8c8c] outline-none"
      />

      {portalTarget &&
        createPortal(
          <AnimatePresence>
            {panelOpen && (
              <motion.div
                key="search-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: panelHeight || 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={ACCORDION_TRANSITION}
                className={`absolute ${
                  panelPlacement === 'above'
                    ? 'bottom-[calc(100%+10px)]'
                    : 'top-[calc(100%+8px)]'
                } left-0 right-0 z-50 mv-panel overflow-hidden`}
              >
                <div
                  ref={scrollRef}
                  className="max-h-[min(70vh,440px)] overflow-y-auto overflow-x-hidden scrollbar-styles"
                >
                  <div ref={contentRef}>
                    {/* Scope Filter Pills */}
                    <div className="flex items-center gap-1 px-2 pt-2 pb-1">
                      {SCOPE_TABS.map((tab) => {
                        const active = scope === tab.value;
                        return (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => setScope(tab.value)}
                            aria-pressed={active}
                            className={
                              active
                                ? 'h-7 px-2.5 rounded-[6px] text-[12px] font-semibold text-white bg-[#353535] whitespace-nowrap'
                                : 'h-7 px-2.5 rounded-[6px] text-[12px] font-medium text-[#b3b3b3] hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap'
                            }
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-1.5 pt-0.5">
                      {showRecent && (
                        <div className="px-1.5 pt-1.5 pb-1">
                          <div className="flex items-center justify-between px-1.5 mb-1">
                            <span className="text-[12px] font-semibold text-[#8c8c8c]">
                              Recent searches
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  localStorage.removeItem(SEARCH_HISTORY_KEY);
                                } catch {
                                  // Ignore
                                }
                                setRecentSearches([]);
                              }}
                              className="text-[12px] text-[#8c8c8c] hover:text-white transition-colors"
                            >
                              Clear history
                            </button>
                          </div>
                          {recentSearches.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => setQuery(term)}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-left text-[13px] text-[#b3b3b3] hover:text-white hover:bg-white/[0.05] transition-colors"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      )}

                      {query.trim().length > 0 && (
                        <>
                          {results.length > 0 && !showInitialSpinner ? (
                            <div className="flex flex-col">
                              {results.map((item, idx) => (
                                <SearchResultRow
                                  key={`${item.mediaType}-${item.id}-${idx}`}
                                  item={item}
                                  onPlay={onPlay}
                                  onSelect={onSelect}
                                  onClose={onClose}
                                />
                              ))}
                              <div ref={sentinelRef} className="h-1" />
                              {loadingMore && (
                                <div className="flex justify-center py-3">
                                  <Loader2 className="w-[18px] h-[18px] animate-spin text-white/70" />
                                </div>
                              )}
                            </div>
                          ) : showInitialSpinner ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="w-[22px] h-[22px] animate-spin text-white/70" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3 py-8">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#8c8c8c]">
                                <Search className="w-5 h-5" />
                              </div>
                              <p className="text-[13px] text-[#8c8c8c] text-center">
                                No results found
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          portalTarget,
        )}
    </>
  );
};
