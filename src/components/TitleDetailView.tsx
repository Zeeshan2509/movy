import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownNarrowWide,
  ArrowDownWideNarrow,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Search,
  Star,
  User,
  X,
} from 'lucide-react';
import { HorizontalRail } from '@/src/components/HorizontalRail';
import { MediaCard } from '@/src/components/MediaCard';
import {
  fetchAnimeDetailAndEpisodes,
  fetchTmdbDetail,
  fetchTvSeasonEpisodes,
} from '@/src/services/api';
import type { MediaEpisode, MediaItem } from '@/src/types/media';

interface TitleDetailViewProps {
  item: MediaItem;
  relatedItems: MediaItem[];
  inWatchlist: boolean;
  onBack: () => void;
  onSelectTitle: (item: MediaItem) => void;
  onPlay: (options: {
    item: MediaItem;
    seasonNumber?: number;
    episode?: MediaEpisode | null;
    animeAudio?: 'sub' | 'dub';
  }) => void;
  onOpenDownload: (options: {
    item: MediaItem;
    seasonNumber?: number;
    episode?: MediaEpisode | null;
    animeAudio?: 'sub' | 'dub';
  }) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

const EPISODES_VIEW_KEY = 'app-episodes-view';
const EPISODE_STEP = 16;

function readInitialEpisodesView(): 'list' | 'card' {
  try {
    const val = localStorage.getItem(EPISODES_VIEW_KEY);
    return val === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

function formatEpisodeAirDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatMinutesShort(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export const TitleDetailView: React.FC<TitleDetailViewProps> = ({
  item,
  relatedItems,
  inWatchlist,
  onBack,
  onSelectTitle,
  onPlay,
  onOpenDownload,
  onToggleWatchlist,
}) => {
  const pillGroupId = useId();
  const [detail, setDetail] = useState<MediaItem>(item);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
  const [episodes, setEpisodes] = useState<MediaEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  const [episodeSearch, setEpisodeSearch] = useState('');
  const [epSearchOpen, setEpSearchOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => readInitialEpisodesView());
  const [visibleCount, setVisibleCount] = useState(EPISODE_STEP);
  const [expandedMobileEpId, setExpandedMobileEpId] = useState<string | number | null>(null);

  const [listCanScroll, setListCanScroll] = useState(false);
  const [listNearBottom, setListNearBottom] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );

  const [animeAudio, setAnimeAudio] = useState<'sub' | 'dub'>('sub');
  const [trailerModalKey, setTrailerModalKey] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);

  const epSearchInputRef = useRef<HTMLInputElement>(null);
  const epControlsRightRef = useRef<HTMLDivElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);
  const epListScrollRef = useRef<HTMLDivElement>(null);
  const [mobileSearchW, setMobileSearchW] = useState(200);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!epSearchOpen || isDesktop) return;
    const container = epControlsRightRef.current?.parentElement?.parentElement;
    if (container) {
      setMobileSearchW(Math.max(150, Math.min(260, container.clientWidth - 132)));
    }
    const timer = window.setTimeout(() => epSearchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [epSearchOpen, isDesktop]);

  useEffect(() => {
    if (epSearchOpen) {
      const timer = window.setTimeout(() => epSearchInputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [epSearchOpen]);

  // Close season dropdown on outside click
  useEffect(() => {
    if (!seasonDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!seasonDropdownRef.current?.contains(e.target as Node)) {
        setSeasonDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [seasonDropdownOpen]);

  // Reset state when title item changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDetail(item);
    setSelectedSeason(1);
    setSeasonDropdownOpen(false);
    setEpisodes([]);
    setEpisodeSearch('');
    setEpSearchOpen(false);
    setSortAsc(true);
    setVisibleCount(EPISODE_STEP);
    setExpandedMobileEpId(null);
    setTrailerModalKey(null);
    setLogoFailed(false);
    setBackdropFailed(false);
  }, [item]);

  // Escape closes trailer modal first, else navigates back
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (trailerModalKey) {
          setTrailerModalKey(null);
        } else if (seasonDropdownOpen) {
          setSeasonDropdownOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trailerModalKey, seasonDropdownOpen, onBack]);

  // Hydrate full detail + episodes
  useEffect(() => {
    let cancelled = false;

    if (item.mediaType === 'anime') {
      setEpisodesLoading(true);
      fetchAnimeDetailAndEpisodes(item)
        .then(({ item: enriched, episodes: animeEps }) => {
          if (cancelled) return;
          setDetail(enriched);
          setEpisodes(animeEps);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setEpisodesLoading(false);
        });
    } else {
      fetchTmdbDetail(item)
        .then((full) => {
          if (!cancelled) {
            setDetail(full);
            if (full.seasonNumbers && full.seasonNumbers.length > 0) {
              setSelectedSeason(full.seasonNumbers[0]);
            }
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [item]);

  // Load TV episodes per season
  useEffect(() => {
    if (item.mediaType !== 'tv') return;
    let cancelled = false;
    setEpisodesLoading(true);
    setVisibleCount(EPISODE_STEP);
    setExpandedMobileEpId(null);
    const tvId = item.tmdbId ?? item.id;
    fetchTvSeasonEpisodes(tvId, selectedSeason)
      .then((eps) => {
        if (!cancelled) setEpisodes(eps);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, selectedSeason]);

  const seasonNumbers = useMemo(() => {
    if (detail.seasonNumbers && detail.seasonNumbers.length > 0) {
      return detail.seasonNumbers;
    }
    const count = detail.seasons || 1;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [detail]);

  const filteredEpisodes = useMemo(() => {
    const q = episodeSearch.trim().toLowerCase();
    const base = q
      ? episodes.filter(
          (ep) =>
            ep.title.toLowerCase().includes(q) ||
            String(ep.episodeNumber).includes(q) ||
            (ep.overview && ep.overview.toLowerCase().includes(q)),
        )
      : episodes;
    return sortAsc ? base : [...base].reverse();
  }, [episodes, episodeSearch, sortAsc]);

  const visibleListEpisodes = useMemo(
    () => filteredEpisodes.slice(0, visibleCount),
    [filteredEpisodes, visibleCount],
  );

  // Track episode list vertical scrollability + bottom state for Movy's scroll hint
  useEffect(() => {
    const el = epListScrollRef.current;
    if (!el || viewMode !== 'list') {
      setListCanScroll(false);
      return;
    }
    const syncScroll = () => {
      const scrollable = el.scrollHeight - el.clientHeight > 16;
      const nearEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      setListCanScroll(scrollable);
      setListNearBottom(nearEnd);
    };
    syncScroll();
    el.addEventListener('scroll', syncScroll, { passive: true });
    window.addEventListener('resize', syncScroll);
    return () => {
      el.removeEventListener('scroll', syncScroll);
      window.removeEventListener('resize', syncScroll);
    };
  }, [viewMode, visibleListEpisodes.length, expandedMobileEpId]);

  const recommendations = useMemo(() => {
    if (detail.recommendations && detail.recommendations.length > 0) {
      return detail.recommendations;
    }
    return relatedItems;
  }, [detail.recommendations, relatedItems]);

  const trailerKey = detail.videos?.[0]?.key ?? null;
  const typeLabel =
    detail.mediaType === 'tv'
      ? 'Series'
      : detail.mediaType === 'anime'
        ? 'Anime'
        : 'Movie';
  const runtimeLabel = detail.runtime
    ? `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m`
    : detail.seasons
      ? `${detail.seasons} ${detail.seasons === 1 ? 'Season' : 'Seasons'}`
      : null;

  const firstEpisode = episodes[0] ?? null;

  const handleCloseEpisodeSearch = () => {
    setEpSearchOpen(false);
    setEpisodeSearch('');
  };

  const handleSelectViewMode = (mode: 'list' | 'card') => {
    setViewMode(mode);
    try {
      localStorage.setItem(EPISODES_VIEW_KEY, mode);
    } catch {
      // Ignore
    }
  };

  const pillBtnClass = 'h-9 rounded-full bg-[#212121] text-[#b3b3b3] transition-colors duration-200';
  const hasMultipleSeasons = detail.mediaType === 'tv' && seasonNumbers.length > 1;
  const seasonHeadingLabel =
    detail.mediaType === 'tv' ? `Season ${selectedSeason}` : 'Episodes';
  const totalEpCount = episodes.length;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f2f2f2]">
      {/* Full-Page Hero Billboard */}
      <section className="relative w-full min-h-[70vh] md:min-h-[82vh] bg-[#0f0f0f] overflow-hidden flex items-end">
        <div className="hero-backdrop-wrap">
          {!backdropFailed && detail.backdropUrl ? (
            <img
              src={detail.backdropUrl}
              alt={detail.title}
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
              className="h-full w-full object-cover object-[50%_25%] md:object-center"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#181818] via-[#121212] to-[#0f0f0f]" />
          )}
        </div>
        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-seam-fade" aria-hidden="true" />

        {/* Hero Metadata & Action Stack */}
        <div className="relative z-[5] w-full pb-12 md:pb-16 pt-36 md:pt-44">
          <div className="layout-container">
            <div className="max-w-[640px]">
              {detail.logoUrl && !logoFailed ? (
                <div className="w-[min(340px,74vw)] md:w-[min(440px,38vw)] h-[72px] md:h-[96px] mb-4">
                  <img
                    src={detail.logoUrl}
                    alt={detail.title}
                    referrerPolicy="no-referrer"
                    onError={() => setLogoFailed(true)}
                    className="h-full w-full object-contain object-left-bottom drop-shadow-[0_10px_28px_rgba(0,0,0,0.6)]"
                  />
                </div>
              ) : (
                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.06] text-white [text-wrap:balance] drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                  {detail.title}
                </h1>
              )}

              {detail.tagline && (
                <p className="mt-2 text-sm italic text-[#b3b3b3]">{detail.tagline}</p>
              )}

              {/* Dot-separated Facts */}
              <div className="mt-4 flex flex-wrap items-center gap-y-2 text-[14px] md:text-[15px] font-medium text-white tabular-nums">
                {detail.rating > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Star className="w-[14px] h-[14px] text-[#e50914] fill-[#e50914]" />
                      <span>{detail.rating.toFixed(1)}</span>
                    </span>
                    <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" />
                  </>
                )}
                <span>{detail.year}</span>
                {runtimeLabel && (
                  <>
                    <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" />
                    <span>{runtimeLabel}</span>
                  </>
                )}
                <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" />
                <span>{typeLabel}</span>
                {detail.certification && (
                  <>
                    <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" />
                    <span className="mv-age-badge">{detail.certification}</span>
                  </>
                )}
              </div>

              {/* Genres */}
              <p className="mt-2.5 flex flex-wrap items-center text-[13px] md:text-[14px] font-medium text-white/75">
                {detail.genres.map((genre, idx) => (
                  <React.Fragment key={genre}>
                    {idx > 0 && (
                      <span className="w-[3px] h-[3px] rounded-full bg-white/40 mx-[9px]" />
                    )}
                    <span>{genre}</span>
                  </React.Fragment>
                ))}
              </p>

              {/* Overview */}
              <p className="mt-4 text-[15px] md:text-[16px] leading-[1.6] text-white/90 max-w-[38rem]">
                {detail.description}
              </p>

              {/* Action Bar */}
              <div className="mt-6 flex flex-wrap items-center gap-2.5 md:gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onPlay({
                      item: detail,
                      seasonNumber: selectedSeason,
                      episode: firstEpisode,
                      animeAudio,
                    })
                  }
                  className="mv-btn mv-btn--primary"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {detail.mediaType === 'tv' || detail.mediaType === 'anime'
                      ? 'Play S1 E1'
                      : 'Play'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleWatchlist(detail)}
                  className="mv-btn mv-btn--secondary"
                >
                  {inWatchlist ? (
                    <>
                      <Check className="w-[18px] h-[18px] text-[#ff4651]" />
                      <span>In List</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-[18px] h-[18px]" />
                      <span>Add to List</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenDownload({
                      item: detail,
                      seasonNumber: selectedSeason,
                      episode: firstEpisode,
                      animeAudio,
                    })
                  }
                  className="mv-btn mv-btn--secondary"
                >
                  <Download className="w-[18px] h-[18px]" />
                  <span>Download</span>
                </button>

                {trailerKey && (
                  <button
                    type="button"
                    onClick={() => setTrailerModalKey(trailerKey)}
                    className="mv-btn mv-btn--secondary"
                  >
                    <Film className="w-[18px] h-[18px]" />
                    <span>Trailer</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Sections Below Hero */}
      <div className="layout-container pb-16 space-y-12 md:space-y-14">
        {/* Original Movy Episodes Section (List View + Card View + Season Selector + Search Pill + Order Toggle) */}
        {(detail.mediaType === 'tv' || detail.mediaType === 'anime') && (
          <section aria-label="Episodes" className="w-full pt-2">
            {/* Movy Episodes Header Row */}
            <div className="flex items-center justify-between gap-3 mb-4 md:mb-5">
              <div
                className={`min-w-0 transition-opacity duration-200 ${
                  epSearchOpen && !isDesktop ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : ''
                }`}
              >
                {hasMultipleSeasons ? (
                  <div ref={seasonDropdownRef} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setSeasonDropdownOpen((o) => !o)}
                      aria-expanded={seasonDropdownOpen}
                      aria-haspopup="listbox"
                      className="inline-flex items-center gap-1.5 text-lg font-semibold leading-tight tracking-[-0.015em] text-[#f2f2f2] hover:text-white md:text-[22px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white rounded-[4px]"
                    >
                      <span className="truncate">{seasonHeadingLabel}</span>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-[#8c8c8c] transition-transform duration-200 ${
                          seasonDropdownOpen ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {seasonDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                          role="listbox"
                          aria-label="Seasons"
                          className="mv-panel absolute left-0 top-[calc(100%+6px)] z-30 min-w-[160px] max-h-72 overflow-y-auto p-1.5 scrollbar-styles"
                        >
                          {seasonNumbers.map((s) => {
                            const active = s === selectedSeason;
                            return (
                              <button
                                key={s}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setSelectedSeason(s);
                                  setSeasonDropdownOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors ${
                                  active
                                    ? 'bg-[#353535] font-semibold text-white'
                                    : 'text-[#b3b3b3] hover:bg-white/[0.06] hover:text-white'
                                }`}
                              >
                                <span>Season {s}</span>
                                {active && <Check size={14} className="text-white" />}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <h2 className="truncate text-lg font-semibold leading-tight tracking-[-0.015em] text-[#f2f2f2] md:text-[22px]">
                    {seasonHeadingLabel}
                  </h2>
                )}

                {totalEpCount > 0 && (
                  <p className="mt-1 truncate text-[13px] text-[#8c8c8c] md:text-sm tabular-nums">
                    {totalEpCount} {totalEpCount === 1 ? 'episode' : 'episodes'}
                  </p>
                )}
              </div>

              {/* Right Movy Controls Pill Cluster */}
              <div ref={epControlsRightRef} className="flex shrink-0 items-center gap-2 ml-auto">
                {detail.mediaType === 'anime' && (
                  <div className={`${pillBtnClass} inline-flex items-center p-[3px]`}>
                    {(['sub', 'dub'] as const).map((audio) => (
                      <button
                        key={audio}
                        type="button"
                        onClick={() => setAnimeAudio(audio)}
                        className={`h-[30px] px-2.5 rounded-full text-[11px] font-bold uppercase transition-colors ${
                          animeAudio === audio
                            ? 'bg-white text-[#0f0f0f]'
                            : 'text-[#8c8c8c] hover:text-white'
                        }`}
                      >
                        {audio}
                      </button>
                    ))}
                  </div>
                )}

                {/* Animated Search Pill */}
                <motion.div
                  className={`${pillBtnClass} flex items-center overflow-hidden ${
                    epSearchOpen
                      ? 'pl-3 pr-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] focus-within:bg-[#2a2a2a] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.32)]'
                      : 'justify-center hover:bg-[#353535]'
                  }`}
                  initial={false}
                  animate={{ width: epSearchOpen ? (isDesktop ? 240 : mobileSearchW) : 36 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {epSearchOpen ? (
                    <>
                      <Search className="h-4 w-4 shrink-0 text-[#8c8c8c]" strokeWidth={2.25} />
                      <input
                        ref={epSearchInputRef}
                        value={episodeSearch}
                        onChange={(e) => setEpisodeSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') handleCloseEpisodeSearch();
                        }}
                        placeholder="Search episode…"
                        aria-label="Search episode"
                        className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 text-[13px] text-[#f2f2f2] outline-none placeholder:text-[#8c8c8c]"
                      />
                      <button
                        type="button"
                        onClick={handleCloseEpisodeSearch}
                        aria-label="Clear search"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8c8c8c] transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEpSearchOpen(true)}
                      title="Search episode…"
                      aria-label="Search episode"
                      className="flex h-full w-full items-center justify-center rounded-full text-[#f2f2f2] hover:text-white"
                    >
                      <Search className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                </motion.div>

                {/* Reverse Sort Order */}
                <button
                  type="button"
                  onClick={() => setSortAsc((v) => !v)}
                  title="Reverse episode order"
                  aria-label="Reverse episode order"
                  aria-pressed={!sortAsc}
                  className={`${pillBtnClass} flex w-9 items-center justify-center hover:bg-[#353535] hover:text-white`}
                >
                  {sortAsc ? (
                    <ArrowDownNarrowWide className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <ArrowDownWideNarrow className="h-4 w-4" strokeWidth={2.25} />
                  )}
                </button>

                {/* List / Card View Segmented Switch with spring pill */}
                <div
                  className={`${pillBtnClass} flex shrink-0 items-center gap-0.5 p-[3px]`}
                  role="group"
                  aria-label="Episode layout"
                >
                  {(
                    [
                      { key: 'list', label: 'List view', Icon: List },
                      { key: 'card', label: 'Card view', Icon: LayoutGrid },
                    ] as const
                  ).map(({ key, label, Icon }) => {
                    const active = viewMode === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectViewMode(key)}
                        title={label}
                        aria-label={label}
                        aria-pressed={active}
                        className={`relative flex h-[30px] w-[34px] items-center justify-center rounded-full transition-colors duration-200 ${
                          active ? 'text-[#0f0f0f]' : 'text-[#8c8c8c] hover:text-white'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId={`${pillGroupId}-ep-view-pill`}
                            className="absolute inset-0 rounded-full bg-white"
                            transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                            aria-hidden="true"
                          />
                        )}
                        <Icon className="relative z-10 h-4 w-4" strokeWidth={2.25} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {episodesLoading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#b3b3b3]">
                <Loader2 className="w-5 h-5 animate-spin text-[#e50914]" />
                <span>Loading episodes...</span>
              </div>
            ) : filteredEpisodes.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[#8c8c8c]">No episodes found for this selection.</p>
              </div>
            ) : viewMode === 'card' ? (
              /* Original Movy Card View (HorizontalRail of large 16:9 gradient cards) */
              <HorizontalRail ariaLabel="Episodes" gap={12} bleed insideContainer>
                {filteredEpisodes.map((ep) => {
                  const formattedRuntime = formatMinutesShort(ep.runtime);
                  const epRating =
                    typeof ep.rating === 'number' && Number.isFinite(ep.rating) && ep.rating > 0
                      ? ep.rating
                      : null;
                  const cardImg = ep.stillUrlLarge || ep.stillUrl || detail.backdropUrl || '';

                  return (
                    <div
                      key={`${ep.id}-${ep.episodeNumber}`}
                      className="w-[min(21.5rem,calc(100%-2.25rem))] shrink-0 sm:w-[320px] md:w-[380px] xl:w-[420px]"
                    >
                      <div className="group relative w-full overflow-hidden rounded-[12px] bg-[#181818]">
                        <button
                          type="button"
                          onClick={() =>
                            onPlay({
                              item: detail,
                              seasonNumber: ep.seasonNumber ?? selectedSeason,
                              episode: ep,
                              animeAudio,
                            })
                          }
                          className="relative block w-full text-left aspect-video rounded-[12px] overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
                        >
                          {cardImg && (
                            <img
                              src={cardImg}
                              alt={ep.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="absolute inset-0 h-full w-full object-cover brightness-[0.84] transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                            />
                          )}
                          <div
                            className="absolute inset-0"
                            style={{
                              background:
                                'linear-gradient(to top, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.8) 26%, rgba(10,10,10,0.42) 52%, rgba(10,10,10,0.08) 78%, rgba(10,10,10,0) 100%)',
                            }}
                          />
                          <div className="absolute inset-x-0 bottom-0 flex flex-col p-3.5 pb-4 md:p-4 md:pb-[18px]">
                            <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug text-white md:text-[17px]">
                              {ep.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-2 text-[13px] text-white/70">
                              <span className="tabular-nums">
                                Episode {ep.episodeNumber}
                                {formattedRuntime ? ` · ${formattedRuntime}` : ''}
                              </span>
                              {epRating !== null && (
                                <span className="ml-auto inline-flex items-center gap-1 font-semibold text-white">
                                  <Star size={11} className="fill-white text-white" />
                                  <span className="tabular-nums">{epRating.toFixed(1)}</span>
                                </span>
                              )}
                            </div>
                            {ep.overview && (
                              <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-white/70 [text-wrap:pretty]">
                                {ep.overview}
                              </p>
                            )}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDownload({
                              item: detail,
                              seasonNumber: ep.seasonNumber ?? selectedSeason,
                              episode: ep,
                              animeAudio,
                            });
                          }}
                          aria-label={`Download Episode ${ep.episodeNumber}`}
                          title="Download"
                          className="mv-icon-btn mv-icon-btn--sm absolute right-2.5 top-2.5 z-10 transition-[opacity,background-color,color,box-shadow,transform] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                        >
                          <Download className="h-4 w-4" strokeWidth={2.25} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </HorizontalRail>
            ) : (
              /* Original Movy List View (Scrollable rows + mobile accordion + Load More) */
              <div className="space-y-4">
                <div className="relative">
                  <div
                    ref={epListScrollRef}
                    className="no-scrollbar flex max-h-[min(32rem,58dvh)] lg:max-h-[40rem] flex-col gap-2 overflow-y-scroll overscroll-y-contain pb-9"
                  >
                    {visibleListEpisodes.map((ep) => {
                      const epKey = `${ep.id}-${ep.episodeNumber}`;
                      const isMobileOpen = expandedMobileEpId === epKey;
                      const formattedAirDate = formatEpisodeAirDate(ep.airDate);
                      const rowMeta = [
                        ep.runtime ? `${ep.runtime} min` : null,
                        formattedAirDate,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      const epRating =
                        typeof ep.rating === 'number' &&
                        Number.isFinite(ep.rating) &&
                        ep.rating > 0
                          ? ep.rating
                          : null;
                      const thumbSrc = ep.stillUrl || detail.backdropUrl || '';

                      const renderThumb = (size: 'sm' | 'md') => (
                        <div
                          className={`relative shrink-0 overflow-hidden rounded-[6px] bg-[#2a2a2a] aspect-video ${
                            size === 'sm' ? 'w-[7.25rem]' : 'w-[12.5rem]'
                          }`}
                        >
                          {thumbSrc && (
                            <img
                              src={thumbSrc}
                              alt={ep.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                            />
                          )}
                          {epRating !== null && (
                            <>
                              <span
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 to-transparent"
                                aria-hidden="true"
                              />
                              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-white">
                                <Star size={10} className="fill-white text-white" />
                                {epRating.toFixed(1)}
                              </span>
                            </>
                          )}
                          {size === 'md' && (
                            <span
                              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                              aria-hidden="true"
                            >
                              <span className="flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-white text-[#0f0f0f] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] transition-transform duration-200 group-hover:scale-100">
                                <Play className="h-4 w-4 fill-current ml-0.5" />
                              </span>
                            </span>
                          )}
                        </div>
                      );

                      return (
                        <div
                          key={epKey}
                          className={`group relative w-full rounded-[12px] bg-[#181818] transition-colors duration-200 md:hover:bg-[#212121] ${
                            isMobileOpen ? 'bg-[#212121]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 p-2.5 md:gap-5 md:p-3 md:pl-2">
                            {/* Mobile Header Row (Accordion Toggle) */}
                            <button
                              type="button"
                              aria-expanded={isMobileOpen}
                              onClick={() =>
                                setExpandedMobileEpId((cur) => (cur === epKey ? null : epKey))
                              }
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
                            >
                              {renderThumb('sm')}
                              <div className="min-w-0 flex-1">
                                <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#f2f2f2]">
                                  {ep.title}
                                </h3>
                                <p className="mt-1 text-[13px] tabular-nums text-[#8c8c8c]">
                                  Episode {ep.episodeNumber}
                                  {ep.runtime ? ` · ${ep.runtime} min` : ''}
                                </p>
                              </div>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-[#8c8c8c] transition-transform duration-200 ${
                                  isMobileOpen ? 'rotate-180 text-white' : ''
                                }`}
                                strokeWidth={2.25}
                                aria-hidden="true"
                              />
                            </button>

                            {/* Desktop Row Link/Button */}
                            <button
                              type="button"
                              onClick={() =>
                                onPlay({
                                  item: detail,
                                  seasonNumber: ep.seasonNumber ?? selectedSeason,
                                  episode: ep,
                                  animeAudio,
                                })
                              }
                              className="hidden min-w-0 flex-1 items-center gap-4 rounded-[8px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:flex"
                            >
                              <span
                                className="w-9 shrink-0 text-center text-[22px] font-semibold tabular-nums text-[#8c8c8c] transition-colors duration-200 group-hover:text-[#f2f2f2]"
                                aria-hidden="true"
                              >
                                {ep.episodeNumber}
                              </span>
                              {renderThumb('md')}
                              <div className="ml-1 flex min-w-0 flex-1 flex-col justify-center">
                                <h3 className="line-clamp-1 text-[16px] font-semibold leading-snug text-[#f2f2f2] transition-colors duration-200 group-hover:text-white">
                                  {ep.title}
                                </h3>
                                {rowMeta && (
                                  <p className="mt-1 text-[13px] tabular-nums text-[#8c8c8c]">
                                    {rowMeta}
                                  </p>
                                )}
                                {ep.overview && (
                                  <p className="mt-2 line-clamp-2 max-w-[44rem] text-[14px] leading-[1.55] text-[#b3b3b3] [text-wrap:pretty]">
                                    {ep.overview}
                                  </p>
                                )}
                              </div>
                            </button>

                            {/* Desktop Download Circular Icon Button */}
                            <div className="hidden shrink-0 items-center self-center md:flex">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenDownload({
                                    item: detail,
                                    seasonNumber: ep.seasonNumber ?? selectedSeason,
                                    episode: ep,
                                    animeAudio,
                                  })
                                }
                                aria-label={`Download Episode ${ep.episodeNumber}`}
                                title="Download"
                                className="mv-icon-btn mv-icon-btn--sm"
                              >
                                <Download className="h-4 w-4" strokeWidth={2.25} />
                              </button>
                            </div>
                          </div>

                          {/* Mobile Expanded Drawer */}
                          {isMobileOpen && (
                            <div className="mv-accordion-in border-t border-white/[0.06] px-3 pb-3 pt-2.5 md:hidden space-y-3">
                              {rowMeta && (
                                <p className="text-[12px] tabular-nums text-[#8c8c8c]">
                                  {rowMeta}
                                </p>
                              )}
                              {ep.overview && (
                                <p className="text-[13px] leading-[1.55] text-[#b3b3b3]">
                                  {ep.overview}
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPlay({
                                      item: detail,
                                      seasonNumber: ep.seasonNumber ?? selectedSeason,
                                      episode: ep,
                                      animeAudio,
                                    })
                                  }
                                  className="mv-btn mv-btn--primary mv-btn--sm"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Play</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenDownload({
                                      item: detail,
                                      seasonNumber: ep.seasonNumber ?? selectedSeason,
                                      episode: ep,
                                      animeAudio,
                                    })
                                  }
                                  className="mv-btn mv-btn--secondary mv-btn--sm"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {listCanScroll && (
                    <p className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-[#0f0f0f] from-35% to-transparent pb-1 pt-8 text-[12px] text-[#8c8c8c]">
                      {listNearBottom ? (
                        <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                      <span>
                        {listNearBottom ? 'Scroll up for more' : 'Scroll down for more'}
                      </span>
                    </p>
                  )}
                </div>

                {visibleCount < filteredEpisodes.length && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + EPISODE_STEP)}
                      className="mv-btn mv-btn--secondary mv-btn--sm"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Cast Horizontal Rail (uses Movy ScrollRow so wheel/drag works seamlessly) */}
        {detail.cast && detail.cast.length > 0 && (
          <div className="-mx-4 md:-mx-8 xl:-mx-12">
            <HorizontalRail title="Cast" ariaLabel="Cast">
              {detail.cast.map((member) => (
                <div
                  key={member.id}
                  className="w-[120px] sm:w-[136px] shrink-0 space-y-2"
                >
                  <div className="aspect-[3/4] w-full rounded-[10px] overflow-hidden bg-[#181818] border border-white/[0.06] flex items-center justify-center">
                    {member.profileUrl ? (
                      <img
                        src={member.profileUrl}
                        alt={member.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <User className="w-8 h-8 text-[#4d4d4d]" />
                    )}
                  </div>
                  <div className="px-0.5">
                    <p className="text-[13px] font-medium text-[#f2f2f2] line-clamp-1">
                      {member.name}
                    </p>
                    {member.character && (
                      <p className="text-[11px] text-[#8c8c8c] line-clamp-1">
                        {member.character}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </HorizontalRail>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="-mx-4 md:-mx-8 xl:-mx-12">
            <HorizontalRail title="More like this" ariaLabel="More titles like this">
              {recommendations.map((rec) => (
                <MediaCard key={`${rec.mediaType}-${rec.id}`} item={rec} onSelect={onSelectTitle} />
              ))}
            </HorizontalRail>
          </div>
        )}
      </div>

      {/* Dedicated Trailer Modal */}
      {trailerModalKey && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${detail.title} Trailer`}
          onClick={() => setTrailerModalKey(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-[#141414] border border-white/10 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white truncate">
                {detail.title} — Trailer
              </h3>
              <button
                type="button"
                onClick={() => setTrailerModalKey(null)}
                aria-label="Close trailer"
                className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[#8c8c8c] hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerModalKey}?autoplay=1&rel=0`}
                title={`${detail.title} Trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
