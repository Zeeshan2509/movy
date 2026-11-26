import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Clock, Loader2, Trash2 } from 'lucide-react';
import { DownloadModal } from '@/src/components/DownloadModal';
import { DownloadsModal } from '@/src/components/DownloadsModal';
import { Header } from '@/src/components/Header';
import { HeroBillboard } from '@/src/components/HeroBillboard';
import { HorizontalRail } from '@/src/components/HorizontalRail';
import { MediaCard } from '@/src/components/MediaCard';
import { TitleDetailView } from '@/src/components/TitleDetailView';
import { Top10Showcase } from '@/src/components/Top10Showcase';
import { VideoPlayerView } from '@/src/components/VideoPlayerView';
import {
  BILLBOARD_IDS,
  CATALOG_ITEMS,
  GENRE_CARDS,
  POPULAR_MOVIES_IDS,
  POPULAR_SHOWS_IDS,
  STREAMING_PROVIDERS,
  TOP_10_IDS,
  TOP_RATED_MOVIES_IDS,
  TOP_RATED_SHOWS_IDS,
  UPCOMING_TV_IDS,
  getItemsByIds,
} from '@/src/data/catalog';
import { useLocalWatchlist } from '@/src/hooks/useLocalWatchlist';
import {
  type AnimeSortKey,
  type BrowseSortKey,
  fetchAnimeCatalog,
  fetchDiscoverCatalog,
  fetchGenreCombinedCatalog,
  fetchHeroBillboardItems,
  fetchNetworkCatalog,
  fetchOnTheAirTv,
  fetchTop10Trending,
  fetchTopRated,
  fetchTrendingByType,
} from '@/src/services/api';
import type {
  GenreCardItem,
  MediaEpisode,
  MediaItem,
  NavTab,
  StreamingProviderId,
} from '@/src/types/media';

const MOVIE_GENRES = [
  { id: null, label: 'All Genres' },
  { id: 28, label: 'Action' },
  { id: 12, label: 'Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 18, label: 'Drama' },
  { id: 14, label: 'Fantasy' },
  { id: 27, label: 'Horror' },
  { id: 9648, label: 'Mystery' },
  { id: 10749, label: 'Romance' },
  { id: 878, label: 'Sci-Fi' },
  { id: 53, label: 'Thriller' },
] as const;

const TV_GENRES = [
  { id: null, label: 'All Genres' },
  { id: 10759, label: 'Action & Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Family' },
  { id: 9648, label: 'Mystery' },
  { id: 10765, label: 'Sci-Fi & Fantasy' },
  { id: 10768, label: 'War & Politics' },
] as const;

const ANIME_GENRES = [
  { id: null, label: 'All Genres' },
  { id: 'action', label: 'Action' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'drama', label: 'Drama' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'horror', label: 'Horror' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'romance', label: 'Romance' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'shounen', label: 'Shounen' },
  { id: 'thriller', label: 'Thriller' },
] as const;

interface PlaybackContext {
  item: MediaItem;
  seasonNumber?: number;
  episode?: MediaEpisode | null;
  animeAudio?: 'sub' | 'dub';
}

interface DownloadContext {
  item: MediaItem;
  seasonNumber: number;
  episode: MediaEpisode | null;
  animeAudio: 'sub' | 'dub';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [activeGenre, setActiveGenre] = useState<GenreCardItem | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<StreamingProviderId>('netflix');
  const [searchOpen, setSearchOpen] = useState(false);

  // Full-Page Title Detail, Full-Screen Cinema Player, and Download Modal
  const [selectedDetailItem, setSelectedDetailItem] = useState<MediaItem | null>(null);
  const [playerContext, setPlayerContext] = useState<PlaybackContext | null>(null);
  const [downloadContext, setDownloadContext] = useState<DownloadContext | null>(null);

  // Live Home Catalog States
  const [billboardItems, setBillboardItems] = useState<MediaItem[]>(() =>
    getItemsByIds(BILLBOARD_IDS),
  );
  const [top10Items, setTop10Items] = useState<MediaItem[]>(() => getItemsByIds(TOP_10_IDS));
  const [upcomingTvItems, setUpcomingTvItems] = useState<MediaItem[]>(() =>
    getItemsByIds(UPCOMING_TV_IDS),
  );
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>(() =>
    getItemsByIds(POPULAR_MOVIES_IDS),
  );
  const [popularShows, setPopularShows] = useState<MediaItem[]>(() =>
    getItemsByIds(POPULAR_SHOWS_IDS),
  );
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>(() =>
    getItemsByIds(TOP_RATED_MOVIES_IDS),
  );
  const [topRatedShows, setTopRatedShows] = useState<MediaItem[]>(() =>
    getItemsByIds(TOP_RATED_SHOWS_IDS),
  );
  const [popularAnime, setPopularAnime] = useState<MediaItem[]>(() =>
    CATALOG_ITEMS.filter((i) => i.mediaType === 'anime'),
  );
  const [providerItemsById, setProviderItemsById] = useState<
    Partial<Record<StreamingProviderId, MediaItem[]>>
  >({});

  // Live Browse Tab States
  const [browseSort, setBrowseSort] = useState<BrowseSortKey>('popular');
  const [animeSort, setAnimeSort] = useState<AnimeSortKey>('popular');
  const [browseGenreId, setBrowseGenreId] = useState<number | null>(null);
  const [animeGenre, setAnimeGenre] = useState<string | null>(null);
  const [browseItems, setBrowseItems] = useState<MediaItem[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(1);
  const [browseTotalResults, setBrowseTotalResults] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);

  // Live Genre Drilldown States
  const [genreItems, setGenreItems] = useState<MediaItem[]>([]);
  const [genrePage, setGenrePage] = useState(1);
  const [genreTotalPages, setGenreTotalPages] = useState(1);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreLoadingMore, setGenreLoadingMore] = useState(false);

  const {
    watchlistItems,
    historyItems,
    watchlistCount,
    isInWatchlist,
    toggleWatchlist,
    clearWatchlist,
    recordWatch,
    clearHistory,
  } = useLocalWatchlist();

  // Keyboard shortcut Cmd/Ctrl+K for instant search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Fetch ALL live Home sections on mount
  useEffect(() => {
    let cancelled = false;

    fetchHeroBillboardItems()
      .then((list) => {
        if (!cancelled && list.length > 0) setBillboardItems(list);
      })
      .catch(() => {});

    fetchTop10Trending()
      .then((list) => {
        if (!cancelled && list.length > 0) setTop10Items(list);
      })
      .catch(() => {});

    fetchOnTheAirTv(1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) setUpcomingTvItems(res.items);
      })
      .catch(() => {});

    fetchTrendingByType('movie', 'week', 1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) setPopularMovies(res.items);
      })
      .catch(() => {});

    fetchTrendingByType('tv', 'week', 1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) setPopularShows(res.items);
      })
      .catch(() => {});

    fetchTopRated('movie', 1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) setTopRatedMovies(res.items);
      })
      .catch(() => {});

    fetchTopRated('tv', 1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) setTopRatedShows(res.items);
      })
      .catch(() => {});

    fetchAnimeCatalog({ page: 1, sort: 'popular' })
      .then((res) => {
        if (!cancelled && res.items.length > 0) setPopularAnime(res.items);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProvider = useMemo(
    () =>
      STREAMING_PROVIDERS.find((p) => p.id === activeProviderId) ?? STREAMING_PROVIDERS[0],
    [activeProviderId],
  );

  // Live fetch whenever active streaming provider changes
  useEffect(() => {
    if (providerItemsById[activeProvider.id]?.length) return;
    let cancelled = false;

    fetchNetworkCatalog(activeProvider.networkIds, 1)
      .then((res) => {
        if (!cancelled && res.items.length > 0) {
          setProviderItemsById((prev) => ({ ...prev, [activeProvider.id]: res.items }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeProvider.id, activeProvider.networkIds, providerItemsById]);

  const providerItems = useMemo(() => {
    const live = providerItemsById[activeProvider.id];
    if (live && live.length > 0) return live;
    return getItemsByIds(activeProvider.itemIds);
  }, [activeProvider, providerItemsById]);

  // Live fetch for Browse Tabs (Movies / Shows / Anime)
  useEffect(() => {
    if (activeGenre || selectedDetailItem) return;
    if (activeTab !== 'movie' && activeTab !== 'tv' && activeTab !== 'anime') return;

    let cancelled = false;
    setBrowseLoading(true);

    (async () => {
      try {
        const res =
          activeTab === 'anime'
            ? await fetchAnimeCatalog({ page: 1, sort: animeSort, genre: animeGenre })
            : await fetchDiscoverCatalog({
                mediaType: activeTab,
                page: 1,
                sort: browseSort,
                genreId: browseGenreId,
              });
        if (!cancelled) {
          setBrowseItems(res.items);
          setBrowsePage(res.page);
          setBrowseTotalPages(res.totalPages);
          setBrowseTotalResults(res.totalResults);
        }
      } catch {
        if (!cancelled) {
          const fallback = CATALOG_ITEMS.filter((i) =>
            activeTab === 'anime'
              ? i.mediaType === 'anime' || i.genreIds.includes(16)
              : i.mediaType === activeTab,
          );
          setBrowseItems(fallback);
          setBrowsePage(1);
          setBrowseTotalPages(1);
          setBrowseTotalResults(fallback.length);
        }
      } finally {
        if (!cancelled) setBrowseLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    activeGenre,
    selectedDetailItem,
    browseSort,
    animeSort,
    browseGenreId,
    animeGenre,
  ]);

  const handleLoadMoreBrowse = async () => {
    if (browseLoadingMore || browsePage >= browseTotalPages) return;
    if (activeTab !== 'movie' && activeTab !== 'tv' && activeTab !== 'anime') return;

    const nextPage = browsePage + 1;
    setBrowseLoadingMore(true);
    try {
      const res =
        activeTab === 'anime'
          ? await fetchAnimeCatalog({ page: nextPage, sort: animeSort, genre: animeGenre })
          : await fetchDiscoverCatalog({
              mediaType: activeTab,
              page: nextPage,
              sort: browseSort,
              genreId: browseGenreId,
            });
      setBrowseItems((prev) => {
        const seen = new Set(prev.map((i) => String(i.id)));
        return [...prev, ...res.items.filter((i) => !seen.has(String(i.id)))];
      });
      setBrowsePage(res.page);
      setBrowseTotalPages(res.totalPages);
    } finally {
      setBrowseLoadingMore(false);
    }
  };

  // Live fetch for Genre Drilldown
  useEffect(() => {
    if (!activeGenre) return;
    let cancelled = false;
    setGenreLoading(true);

    fetchGenreCombinedCatalog(activeGenre.genreId, 1)
      .then((res) => {
        if (!cancelled) {
          setGenreItems(res.items);
          setGenrePage(res.page);
          setGenreTotalPages(res.totalPages);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGenreItems(
            CATALOG_ITEMS.filter((item) => item.genreIds.includes(activeGenre.genreId)),
          );
          setGenrePage(1);
          setGenreTotalPages(1);
        }
      })
      .finally(() => {
        if (!cancelled) setGenreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeGenre]);

  const handleLoadMoreGenre = async () => {
    if (!activeGenre || genreLoadingMore || genrePage >= genreTotalPages) return;
    const nextPage = genrePage + 1;
    setGenreLoadingMore(true);
    try {
      const res = await fetchGenreCombinedCatalog(activeGenre.genreId, nextPage);
      setGenreItems((prev) => {
        const seen = new Set(prev.map((i) => String(i.id)));
        return [...prev, ...res.items.filter((i) => !seen.has(String(i.id)))];
      });
      setGenrePage(res.page);
      setGenreTotalPages(res.totalPages);
    } finally {
      setGenreLoadingMore(false);
    }
  };

  const relatedItems = useMemo(() => {
    if (!selectedDetailItem) return [];
    const pool = [...popularMovies, ...popularShows, ...CATALOG_ITEMS];
    const seen = new Set<string>();
    return pool
      .filter((candidate) => {
        const key = String(candidate.id);
        if (key === String(selectedDetailItem.id) || seen.has(key)) return false;
        seen.add(key);
        return candidate.genreIds.some((g) => selectedDetailItem.genreIds.includes(g));
      })
      .slice(0, 12);
  }, [selectedDetailItem, popularMovies, popularShows]);

  // Support browser back/forward button across detail, genre, and player views
  useEffect(() => {
    const onPopState = () => {
      if (playerContext) {
        setPlayerContext(null);
      } else if (selectedDetailItem) {
        setSelectedDetailItem(null);
      } else if (activeGenre) {
        setActiveGenre(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [playerContext, selectedDetailItem, activeGenre]);

  const handleSelectTab = (tab: NavTab) => {
    setSelectedDetailItem(null);
    setActiveGenre(null);
    if (tab !== activeTab) {
      setBrowseGenreId(null);
      setAnimeGenre(null);
      setBrowseSort('popular');
      setAnimeSort('popular');
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectGenre = (genre: GenreCardItem) => {
    window.history.pushState({ view: 'genre', id: genre.id }, '');
    setSelectedDetailItem(null);
    setActiveGenre(genre);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDetail = (item: MediaItem) => {
    window.history.pushState({ view: 'detail', id: item.id }, '');
    setSelectedDetailItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartPlay = (options: PlaybackContext) => {
    window.history.pushState({ view: 'player', id: options.item.id }, '');
    recordWatch(options.item);
    setPlayerContext(options);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0f0f] text-[#f2f2f2]">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        searchOpen={searchOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onCloseSearch={() => setSearchOpen(false)}
        watchlistCount={watchlistCount}
        isInWatchlist={isInWatchlist}
        onToggleWatchlist={toggleWatchlist}
        onPlayMedia={(item) => handleStartPlay({ item })}
        onSelectMedia={handleOpenDetail}
      />

      <main className="flex-1 pb-24 md:pb-12">
        {selectedDetailItem ? (
          <TitleDetailView
            item={selectedDetailItem}
            relatedItems={relatedItems}
            inWatchlist={isInWatchlist(selectedDetailItem.id)}
            onBack={() => setSelectedDetailItem(null)}
            onSelectTitle={handleOpenDetail}
            onPlay={(opts) => handleStartPlay(opts)}
            onOpenDownload={(opts) =>
              setDownloadContext({
                item: opts.item,
                seasonNumber: opts.seasonNumber ?? 1,
                episode: opts.episode ?? null,
                animeAudio: opts.animeAudio ?? 'sub',
              })
            }
            onToggleWatchlist={toggleWatchlist}
          />
        ) : activeGenre ? (
          /* Live Genre Drilldown View */
          <div className="layout-container pt-24 md:pt-28 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveGenre(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b3b3b3] hover:text-white mb-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to browse</span>
                </button>
                <h1 className="font-display text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {activeGenre.label}
                </h1>
                <p className="text-sm text-[#b3b3b3] tabular-nums">
                  Movies &amp; series in {activeGenre.label}
                </p>
              </div>
            </div>

            {genreLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-[#b3b3b3]">
                <Loader2 className="w-7 h-7 animate-spin text-[#e50914]" />
                <span>Fetching {activeGenre.label} titles...</span>
              </div>
            ) : genreItems.length === 0 ? (
              <div className="rounded-[10px] bg-[#181818] border border-white/[0.08] p-10 text-center space-y-3">
                <p className="text-sm text-[#b3b3b3]">
                  No titles match this genre right now.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveGenre(null)}
                  className="mv-btn mv-btn--primary mv-btn--sm"
                >
                  Return Home
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
                  {genreItems.map((item) => (
                    <MediaCard
                      key={`${item.mediaType}-${item.id}`}
                      item={item}
                      fluid
                      onSelect={handleOpenDetail}
                    />
                  ))}
                </div>

                {genrePage < genreTotalPages && (
                  <div className="flex justify-center pt-4">
                    <button
                      type="button"
                      onClick={handleLoadMoreGenre}
                      disabled={genreLoadingMore}
                      className="mv-btn mv-btn--secondary"
                    >
                      {genreLoadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading more...</span>
                        </>
                      ) : (
                        <span>Load More</span>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : activeTab === 'watchlist' ? (
          /* Local On-Device Watchlist & History View */
          <div className="layout-container pt-24 md:pt-28 space-y-12">
            <section aria-label="My Watchlist" className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                    My Watchlist
                  </h1>
                  <p className="mt-1 text-sm text-[#b3b3b3]">
                    Saved locally on this device · No account required
                  </p>
                </div>

                {watchlistItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearWatchlist}
                    className="mv-btn mv-btn--secondary mv-btn--sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Watchlist</span>
                  </button>
                )}
              </div>

              {watchlistItems.length === 0 ? (
                <div className="rounded-[10px] bg-[#181818] border border-white/[0.08] p-10 sm:p-14 text-center space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#212121] border border-white/10 text-[#e50914]">
                    <Bookmark className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="font-display text-lg font-bold text-white">
                      Your Watchlist is empty
                    </h2>
                    <p className="text-sm text-[#b3b3b3] max-w-md mx-auto">
                      Open any movie, TV show, or anime and tap &ldquo;Add to List&rdquo; to save
                      it here on your device.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('home')}
                    className="mv-btn mv-btn--primary mv-btn--sm"
                  >
                    Browse Catalog
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
                  {watchlistItems.map((item) => (
                    <MediaCard
                      key={`${item.mediaType}-${item.id}`}
                      item={item}
                      fluid
                      onSelect={handleOpenDetail}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Recently Watched Shelf */}
            {historyItems.length > 0 && (
              <section
                aria-label="Recently Watched"
                className="space-y-5 pt-4 border-t border-white/[0.06]"
              >
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-5 h-5 text-[#b3b3b3]" aria-hidden="true" />
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">
                        Recently Watched
                      </h2>
                      <p className="text-xs text-[#b3b3b3]">
                        Playback history stored privately on your device
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="mv-btn mv-btn--secondary mv-btn--sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
                  {historyItems.map((item) => (
                    <MediaCard
                      key={`hist-${item.mediaType}-${item.id}`}
                      item={item}
                      fluid
                      onSelect={handleOpenDetail}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : activeTab === 'movie' || activeTab === 'tv' || activeTab === 'anime' ? (
          /* Live Paginated Category Catalog Browser */
          <div className="layout-container pt-24 md:pt-28 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {activeTab === 'movie'
                    ? 'Movies'
                    : activeTab === 'tv'
                      ? 'TV Shows'
                      : 'Anime'}
                </h1>
                <p className="mt-1 text-sm text-[#b3b3b3] tabular-nums">
                  {browseTotalResults > 0
                    ? `${browseTotalResults.toLocaleString()} titles available`
                    : 'Fetching complete catalog...'}
                </p>
              </div>

              {/* Live Sort Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeTab === 'anime'
                  ? (
                      [
                        { id: 'popular', label: 'Most Viewed' },
                        { id: 'rating', label: 'Top Rated' },
                        { id: 'updated', label: 'Latest Updated' },
                        { id: 'added', label: 'Recently Added' },
                        { id: 'name', label: 'A–Z' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAnimeSort(s.id)}
                        className={`h-8 px-3 rounded-[8px] text-xs font-medium transition ${
                          animeSort === s.id
                            ? 'bg-white text-[#0f0f0f] font-semibold'
                            : 'bg-[#181818] text-[#b3b3b3] hover:text-white border border-white/[0.06]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))
                  : (
                      [
                        { id: 'popular', label: 'Popular' },
                        { id: 'top_rated', label: 'Top Rated' },
                        { id: 'newest', label: 'Newest' },
                        {
                          id: 'now_playing',
                          label: activeTab === 'movie' ? 'Now Playing' : 'On Air',
                        },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setBrowseSort(s.id)}
                        className={`h-8 px-3 rounded-[8px] text-xs font-medium transition ${
                          browseSort === s.id
                            ? 'bg-white text-[#0f0f0f] font-semibold'
                            : 'bg-[#181818] text-[#b3b3b3] hover:text-white border border-white/[0.06]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
              </div>
            </div>

            {/* Genre Filter Strip */}
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
              {activeTab === 'anime'
                ? ANIME_GENRES.map((g) => {
                    const selected = animeGenre === g.id;
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => setAnimeGenre(g.id)}
                        className={`h-8 px-3.5 rounded-[8px] text-xs font-medium whitespace-nowrap shrink-0 transition ${
                          selected
                            ? 'bg-[#e50914] text-white font-semibold'
                            : 'bg-[#181818] text-[#b3b3b3] border border-white/[0.08] hover:text-white'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })
                : (activeTab === 'movie' ? MOVIE_GENRES : TV_GENRES).map((g) => {
                    const selected = browseGenreId === g.id;
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => setBrowseGenreId(g.id)}
                        className={`h-8 px-3.5 rounded-[8px] text-xs font-medium whitespace-nowrap shrink-0 transition ${
                          selected
                            ? 'bg-[#e50914] text-white font-semibold'
                            : 'bg-[#181818] text-[#b3b3b3] border border-white/[0.08] hover:text-white'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
            </div>

            {browseLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-[#b3b3b3]">
                <Loader2 className="w-7 h-7 animate-spin text-[#e50914]" />
                <span>Fetching live catalog...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
                  {browseItems.map((item) => (
                    <MediaCard
                      key={`${item.mediaType}-${item.id}`}
                      item={item}
                      fluid
                      showEpisodeMeta={activeTab === 'tv'}
                      onSelect={handleOpenDetail}
                    />
                  ))}
                </div>

                {browsePage < browseTotalPages && (
                  <div className="flex justify-center pt-4">
                    <button
                      type="button"
                      onClick={handleLoadMoreBrowse}
                      disabled={browseLoadingMore}
                      className="mv-btn mv-btn--secondary"
                    >
                      {browseLoadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading more titles...</span>
                        </>
                      ) : (
                        <span>Load More</span>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Exact Original Moviesx Home Experience */
          <div className="space-y-12 md:space-y-16">
            <HeroBillboard
              items={billboardItems}
              onPlay={(item) => handleStartPlay({ item })}
              onMoreInfo={handleOpenDetail}
              paused={Boolean(playerContext || searchOpen || downloadContext)}
            />

            <Top10Showcase items={top10Items} onSelect={handleOpenDetail} />

            <HorizontalRail
              title="Current & Upcoming TV Shows"
              onAction={() => handleSelectTab('tv')}
              ariaLabel="Current and upcoming TV shows"
            >
              {upcomingTvItems.map((item) => (
                <MediaCard
                  key={`upcoming-${item.id}`}
                  item={item}
                  showEpisodeMeta
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            <HorizontalRail
              title="Trending Movies This Week"
              onAction={() => handleSelectTab('movie')}
              ariaLabel="Trending movies this week"
            >
              {popularMovies.map((item) => (
                <MediaCard
                  key={`popm-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            <HorizontalRail
              title="Popular Series"
              onAction={() => handleSelectTab('tv')}
              ariaLabel="Popular series"
            >
              {popularShows.map((item) => (
                <MediaCard
                  key={`pops-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            {/* Exact Original StreamingRail with .webp App Icons */}
            <HorizontalRail
              title={`Only on ${activeProvider.name}`}
              ariaLabel={`Only on ${activeProvider.name}`}
              headerExtra={
                <div
                  className="no-scrollbar flex items-center gap-3 overflow-x-auto py-1.5 pl-1"
                  role="tablist"
                  aria-label="Streaming providers"
                >
                  {STREAMING_PROVIDERS.map((provider) => {
                    const selected = provider.id === activeProviderId;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={provider.name}
                        onClick={() => setActiveProviderId(provider.id)}
                        className={`streaming-app-btn ${
                          selected ? 'streaming-app-btn-active' : ''
                        }`}
                      >
                        <img
                          src={provider.iconUrl}
                          alt={provider.name}
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              }
            >
              {providerItems.map((item) => (
                <MediaCard
                  key={`prov-${activeProviderId}-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            <HorizontalRail
              title="Popular Anime"
              onAction={() => handleSelectTab('anime')}
              ariaLabel="Popular anime"
            >
              {popularAnime.map((item) => (
                <MediaCard
                  key={`anime-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            <HorizontalRail
              title="Top Rated Movies"
              ariaLabel="Top rated movies"
            >
              {topRatedMovies.map((item) => (
                <MediaCard
                  key={`trm-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            <HorizontalRail
              title="Top Rated Series"
              ariaLabel="Top rated series"
            >
              {topRatedShows.map((item) => (
                <MediaCard
                  key={`trs-${item.id}`}
                  item={item}
                  onSelect={handleOpenDetail}
                />
              ))}
            </HorizontalRail>

            {/* Exact Original 16:9 Wallpaper Genre Cards */}
            <HorizontalRail
              title="Popular Genres"
              ariaLabel="Popular genres"
            >
              {GENRE_CARDS.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => handleSelectGenre(genre)}
                  className="group relative shrink-0 aspect-[16/9] w-[220px] md:w-[248px] xl:w-[268px] rounded-[10px] overflow-hidden bg-[#212121] border border-white/[0.06] hover:border-white/[0.22] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] transition-[border-color,transform] duration-200"
                >
                  {genre.backdropUrl && (
                    <img
                      src={genre.backdropUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      aria-hidden="true"
                      className="h-full w-full object-cover object-[50%_30%] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                    />
                  )}
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(90deg,#0f0f0feb 0%,#0f0f0fa3 34%,#0f0f0f29 72%,#0f0f0f00 100%),linear-gradient(#0000 40%,#00000080 100%)',
                    }}
                    aria-hidden="true"
                  />
                  <span className="relative z-10 flex items-end h-full w-full p-4">
                    <span className="font-display text-[17px] font-bold text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                      {genre.label}
                    </span>
                  </span>
                </button>
              ))}
            </HorizontalRail>
          </div>
        )}
      </main>

      {/* Original Movy Clean Footer */}
      <footer className="relative z-[1] border-t border-white/[0.06]">
        <div className="layout-container pt-8 pb-[calc(env(safe-area-inset-bottom)+112px)] md:pt-10 md:pb-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-[#8c8c8c]">
            <p className="max-w-xl leading-relaxed">
              This site does not store any files on its server. All contents are provided by
              non-affiliated third parties.
            </p>
            <p className="shrink-0 tabular-nums">© 2026 Movy</p>
          </div>
        </div>
      </footer>

      {/* Cinema Video Player (Real Full Movies / Episodes) */}
      {playerContext && (
        <VideoPlayerView
          item={playerContext.item}
          initialSeason={playerContext.seasonNumber}
          initialEpisode={playerContext.episode}
          initialAnimeAudio={playerContext.animeAudio}
          inWatchlist={isInWatchlist(playerContext.item.id)}
          onToggleWatchlist={toggleWatchlist}
          onOpenDownload={(ctx) => setDownloadContext(ctx)}
          onClose={() => setPlayerContext(null)}
        />
      )}

      {/* Download Modal */}
      <DownloadModal
        open={Boolean(downloadContext)}
        item={downloadContext?.item ?? null}
        seasonNumber={downloadContext?.seasonNumber}
        episode={downloadContext?.episode}
        animeAudio={downloadContext?.animeAudio}
        onClose={() => setDownloadContext(null)}
      />

      {/* Persistent Download Queue & History */}
      <DownloadsModal />
    </div>
  );
}
