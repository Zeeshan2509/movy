import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  Download,
  Film,
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
  const [detail, setDetail] = useState<MediaItem>(item);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<MediaEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [animeAudio, setAnimeAudio] = useState<'sub' | 'dub'>('sub');
  const [trailerModalKey, setTrailerModalKey] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);

  // Scroll to top when item changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setDetail(item);
    setSelectedSeason(1);
    setEpisodes([]);
    setEpisodeSearch('');
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
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trailerModalKey, onBack]);

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
    if (!q) return episodes;
    return episodes.filter(
      (ep) =>
        ep.title.toLowerCase().includes(q) ||
        String(ep.episodeNumber).includes(q) ||
        (ep.overview && ep.overview.toLowerCase().includes(q)),
    );
  }, [episodes, episodeSearch]);

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

              {/* Exact Action Bar: Play, Watchlist, Download, Trailer */}
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
        {/* Episodes Section (TV Shows & Anime) */}
        {(detail.mediaType === 'tv' || detail.mediaType === 'anime') && (
          <section aria-label="Episodes" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg md:text-[22px] font-semibold tracking-[-0.015em] text-[#f2f2f2]">
                  Episodes
                </h2>

                {detail.mediaType === 'tv' && seasonNumbers.length > 0 && (
                  <select
                    aria-label="Select season"
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(Number(e.target.value))}
                    className="h-9 px-3 rounded-lg bg-[#181818] border border-white/15 text-xs font-semibold text-white focus:outline-none focus:border-white/40 cursor-pointer"
                  >
                    {seasonNumbers.map((s) => (
                      <option key={s} value={s} className="bg-[#181818]">
                        Season {s}
                      </option>
                    ))}
                  </select>
                )}

                {detail.mediaType === 'anime' && (
                  <div className="inline-flex rounded-lg bg-[#181818] border border-white/10 p-0.5">
                    {(['sub', 'dub'] as const).map((audio) => (
                      <button
                        key={audio}
                        type="button"
                        onClick={() => setAnimeAudio(audio)}
                        className={`h-7 px-3 rounded-md text-xs font-bold uppercase transition ${
                          animeAudio === audio
                            ? 'bg-[#e50914] text-white'
                            : 'text-[#b3b3b3] hover:text-white'
                        }`}
                      >
                        {audio}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Episode Search */}
              {episodes.length > 6 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#8c8c8c] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={episodeSearch}
                    onChange={(e) => setEpisodeSearch(e.target.value)}
                    placeholder="Search episodes..."
                    className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#181818] border border-white/10 text-xs text-white placeholder-[#8c8c8c] focus:outline-none focus:border-white/30"
                  />
                </div>
              )}
            </div>

            {episodesLoading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#b3b3b3]">
                <Loader2 className="w-5 h-5 animate-spin text-[#e50914]" />
                <span>Loading episodes...</span>
              </div>
            ) : filteredEpisodes.length === 0 ? (
              <div className="rounded-[10px] bg-[#181818] border border-white/[0.06] p-6 text-sm text-[#8c8c8c]">
                No episodes found for this selection.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredEpisodes.map((ep) => (
                  <article
                    key={`${ep.id}-${ep.episodeNumber}`}
                    className="group rounded-[10px] bg-[#181818] hover:bg-[#212121] border border-white/[0.06] hover:border-white/[0.16] overflow-hidden transition flex flex-col"
                  >
                    <div className="flex items-start gap-3 p-3">
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
                        className="relative w-32 aspect-video rounded-[6px] bg-[#0f0f0f] overflow-hidden shrink-0 focus:outline-none"
                      >
                        {ep.stillUrl ? (
                          <img
                            src={ep.stillUrl}
                            alt={ep.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : detail.backdropUrl ? (
                          <img
                            src={detail.backdropUrl}
                            alt={ep.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover opacity-50"
                          />
                        ) : null}
                        <span className="absolute inset-0 bg-black/35 group-hover:bg-black/20 flex items-center justify-center transition">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0f0f0f] shadow">
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </span>
                        </span>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white tabular-nums">
                          E{ep.episodeNumber}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
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
                            className="text-left focus:outline-none"
                          >
                            <h3 className="text-sm font-semibold text-[#f2f2f2] group-hover:text-white line-clamp-1">
                              {ep.episodeNumber}. {ep.title}
                            </h3>
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
                            aria-label={`Download Episode ${ep.episodeNumber}`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white/[0.06] hover:bg-white/[0.14] text-[#b3b3b3] hover:text-white transition shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {(ep.runtime || ep.airDate) && (
                          <p className="text-[11px] text-[#8c8c8c] tabular-nums">
                            {[ep.runtime ? `${ep.runtime}m` : null, ep.airDate]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        {ep.overview && (
                          <p className="text-xs leading-relaxed text-[#b3b3b3] line-clamp-2">
                            {ep.overview}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Cast Horizontal Row */}
        {detail.cast && detail.cast.length > 0 && (
          <section aria-label="Cast" className="space-y-4">
            <h2 className="text-lg md:text-[22px] font-semibold tracking-[-0.015em] text-[#f2f2f2]">
              Cast
            </h2>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
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
            </div>
          </section>
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

      {/* Dedicated Trailer Modal (strictly for Trailer button) */}
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
