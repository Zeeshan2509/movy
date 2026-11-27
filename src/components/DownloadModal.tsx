import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Film,
  FolderOpen,
  History,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useDownloadManager } from '@/src/context/DownloadContext';
import { fetchTmdbDetail } from '@/src/services/api';
import {
  expandSourcesForDownload,
  fetchAnimeEpisodeStream,
  fetchBackendMovieTvSources,
  fetchLiveSubtitles,
  filterEnglishSubtitles,
  formatDownloadBytes,
  getQualityTierTag,
} from '@/src/services/streamResolver';
import type {
  MediaEpisode,
  MediaItem,
  StreamSourceOption,
  SubtitleTrack,
} from '@/src/types/media';

interface DownloadModalProps {
  open: boolean;
  item: MediaItem | null;
  seasonNumber?: number;
  episode?: MediaEpisode | null;
  animeAudio?: 'sub' | 'dub';
  onClose: () => void;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  open,
  item,
  seasonNumber = 1,
  episode = null,
  animeAudio = 'sub',
  onClose,
}) => {
  const {
    downloads,
    isNativeDownload,
    saveDirectory,
    browseSaveDirectory,
    startVideoDownload,
    startSubtitleDownload,
    cancelDownload,
    setDownloadsOpen,
  } = useDownloadManager();

  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<StreamSourceOption[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [subQuery, setSubQuery] = useState('');
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!open || !item) return;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setSources([]);
    setSubtitles([]);
    setSubQuery('');
    setErrorReason(null);

    const epNum = episode?.episodeNumber ?? 1;
    const secNum = episode?.seasonNumber ?? seasonNumber;

    (async () => {
      try {
        if (item.mediaType === 'anime') {
          const [animeRes, subs] = await Promise.all([
            episode
              ? fetchAnimeEpisodeStream(episode, animeAudio, controller.signal)
              : Promise.resolve({ sources: [], subtitles: [] }),
            item.imdbId || item.tmdbId
              ? fetchLiveSubtitles(item.imdbId || item.tmdbId, 'tv', secNum, epNum, controller.signal)
              : Promise.resolve([]),
          ]);
          let rawSources = animeRes.sources.filter((s) => s.kind === 'hls' || s.kind === 'mp4');
          let fallbackError: string | null = null;
          if (rawSources.length === 0 && item.tmdbId) {
            const tvRes = await fetchBackendMovieTvSources(
              { ...item, mediaType: 'tv' },
              secNum,
              epNum,
              undefined,
              controller.signal,
            );
            rawSources = tvRes.servers
              .flatMap((s) => s.sources)
              .filter((s) => s.kind === 'hls' || s.kind === 'mp4');
            if (rawSources.length === 0 && tvRes.errorReason) {
              fallbackError = tvRes.errorReason;
            }
          }
          const finalSources =
            rawSources.length > 0
              ? await expandSourcesForDownload(rawSources, controller.signal).catch(() => rawSources)
              : [];
          if (!cancelled) {
            setSources(finalSources);
            setSubtitles(filterEnglishSubtitles(subs.length > 0 ? subs : animeRes.subtitles));
            if (finalSources.length === 0 && fallbackError) {
              setErrorReason(fallbackError);
            }
          }
        } else {
          const hydratedItem = item.imdbId
            ? item
            : await fetchTmdbDetail(item).catch(() => item);
          const tmdbId = hydratedItem.tmdbId ?? hydratedItem.id;
          const [directRes, liveSubs] = await Promise.all([
            fetchBackendMovieTvSources(
              hydratedItem,
              secNum,
              epNum,
              undefined,
              controller.signal,
            ).catch((err) => ({
              servers: [],
              sources: [] as StreamSourceOption[],
              subtitles: [] as SubtitleTrack[],
              activeServerId: null,
              errorReason: (err as Error)?.message || 'Failed to reach streaming servers',
            })),
            fetchLiveSubtitles(
              hydratedItem.imdbId || tmdbId,
              hydratedItem.mediaType,
              secNum,
              epNum,
              controller.signal,
            ),
          ]);
          const rawSources = (
            directRes.servers.length > 0
              ? directRes.servers.flatMap((s) => s.sources)
              : directRes.sources
          ).filter((s) => s.kind === 'hls' || s.kind === 'mp4');

          const expandedSources =
            rawSources.length > 0
              ? await expandSourcesForDownload(rawSources, controller.signal).catch(() => rawSources)
              : [];

          if (!cancelled) {
            setSources(expandedSources);
            setSubtitles(
              filterEnglishSubtitles(liveSubs.length > 0 ? liveSubs : directRes.subtitles),
            );
            if (expandedSources.length === 0 && directRes.errorReason) {
              setErrorReason(directRes.errorReason);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, item, seasonNumber, episode, animeAudio, retryNonce]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredSubs = useMemo(() => {
    const q = subQuery.trim().toLowerCase();
    if (!q) return subtitles;
    return subtitles.filter(
      (s) =>
        s.language.toLowerCase().includes(q) || s.langCode.toLowerCase().includes(q),
    );
  }, [subtitles, subQuery]);

  if (!open || !item) return null;

  const episodeBadge =
    item.mediaType === 'tv'
      ? `S${episode?.seasonNumber ?? seasonNumber} E${episode?.episodeNumber ?? 1}${
          episode?.title ? ` · ${episode.title}` : ''
        }`
      : item.mediaType === 'anime' && episode
        ? `Ep ${episode.episodeNumber}${episode.title ? ` · ${episode.title}` : ''} (${animeAudio.toUpperCase()})`
        : null;

  const baseFileName = sanitizeFilename(
    episodeBadge ? `${item.title} ${episodeBadge}` : `${item.title} (${item.year})`,
  );

  const handleVideoDownload = (source: StreamSourceOption) => {
    const isMkv = source.kind !== 'hls' && decodeURIComponent(source.url).toLowerCase().includes('.mkv');
    const ext = source.kind === 'hls' ? 'ts' : isMkv ? 'mkv' : 'mp4';
    const filename = `${baseFileName} [${source.quality}].${ext}`;
    startVideoDownload({
      item,
      episodeLabel: episodeBadge,
      quality: source.quality,
      filename,
      url: source.url,
    });
  };

  const handleSubtitleDownload = (sub: SubtitleTrack) => {
    const subFilename = `${baseFileName}.${sub.langCode || 'sub'}.srt`;
    void startSubtitleDownload({
      item,
      episodeLabel: episodeBadge,
      subtitle: sub,
      filename: subFilename,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Download ${item.title}`}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl bg-[#141414] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white leading-tight">
                Download
              </h2>
              <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
                {item.title} ({item.year})
              </p>
              {episodeBadge && (
                <p className="text-[11px] font-medium text-[#ff4651] truncate mt-0.5">
                  {episodeBadge}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {downloads.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setDownloadsOpen(true);
                }}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-semibold text-white transition"
              >
                <History className="w-3.5 h-3.5" />
                <span>Queue ({downloads.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close download modal"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[#8c8c8c] hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {isNativeDownload && (
            <div className="rounded-xl bg-[#181818] border border-white/[0.08] px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8c8c8c]">
                  Save Location
                </p>
                <p
                  className="text-xs font-medium text-[#e5e5e5] truncate mt-0.5"
                  title={saveDirectory || 'Resolving folder...'}
                >
                  {saveDirectory || 'Resolving default Downloads/Movy folder...'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void browseSaveDirectory()}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-xs font-semibold text-white transition shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Change</span>
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-[#b3b3b3]">
              <Loader2 className="w-6 h-6 animate-spin text-[#e50914]" />
              <span>Finding available video files &amp; subtitles...</span>
            </div>
          ) : (
            <>
              {/* Video Quality Section */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8c8c8c]">
                    Video Quality
                  </h3>
                  {sources.length > 0 && (
                    <span className="text-[11px] text-[#8c8c8c] tabular-nums">
                      {sources.length} {sources.length === 1 ? 'option' : 'options'}
                    </span>
                  )}
                </div>

                {sources.length > 0 ? (
                  <div className="space-y-2">
                    {sources.map((src) => {
                      const matched = downloads.find((d) => d.url === src.url);
                      const isActive = matched?.status === 'downloading';
                      const isDone = matched?.status === 'completed';
                      const tierTag = getQualityTierTag(src.quality);
                      const formatLabel =
                        src.kind === 'hls'
                          ? 'HLS (.ts)'
                          : decodeURIComponent(src.url).toLowerCase().includes('.mkv')
                            ? 'MKV'
                            : 'MP4';

                      return (
                        <div
                          key={src.id}
                          className="rounded-xl bg-[#181818] border border-white/[0.08] p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Film className="w-4 h-4 text-[#b3b3b3] shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-white truncate">
                                    {src.quality}
                                  </p>
                                  {tierTag && (
                                    <span className="px-1.5 py-0.5 rounded bg-white/[0.1] text-[10px] font-semibold text-[#e5e5e5] uppercase tracking-wide shrink-0">
                                      {tierTag}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#8c8c8c] truncate">
                                  {[src.label, src.note, formatLabel].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </div>

                            {isActive && matched ? (
                              <button
                                type="button"
                                onClick={() => cancelDownload(matched.id)}
                                className="h-8 px-3 rounded-lg bg-[#2a2a2a] hover:bg-[#353535] text-xs font-semibold text-white transition shrink-0"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleVideoDownload(src)}
                                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-white hover:bg-white/85 text-[#0f0f0f] text-xs font-bold transition shrink-0"
                              >
                                {isDone ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Save</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {isActive && matched && (
                            <div className="space-y-1">
                              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-[#e50914] transition-all duration-200"
                                  style={{ width: `${Math.max(4, matched.progress)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#b3b3b3] tabular-nums">
                                <span className="truncate">
                                  {matched.quality} · {matched.statusText}
                                </span>
                                <span>
                                  {matched.bytesDownloaded > 0
                                    ? `${formatDownloadBytes(matched.bytesDownloaded)} · ${matched.progress}%`
                                    : `${matched.progress}%`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#181818] border border-white/[0.06] p-3.5 text-xs leading-relaxed text-[#b3b3b3] space-y-2.5">
                    <p>
                      {errorReason
                        ? `Could not connect to streaming nodes (${errorReason}). Please retry.`
                        : 'Direct MP4/HLS download links are not exposed by the active streaming node for this title right now.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRetryNonce((n) => n + 1)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.1] hover:bg-white/[0.18] text-white text-xs font-semibold transition"
                    >
                      Retry Servers
                    </button>
                  </div>
                )}
              </section>

              {/* Subtitles Section */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8c8c8c]">
                    Subtitles
                  </h3>
                  <span className="text-[11px] text-[#8c8c8c] tabular-nums">
                    {subtitles.length} available
                  </span>
                </div>

                {subtitles.length > 4 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#8c8c8c] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={subQuery}
                      onChange={(e) => setSubQuery(e.target.value)}
                      placeholder="Filter subtitle language..."
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#181818] border border-white/10 text-xs text-white placeholder-[#8c8c8c] focus:outline-none focus:border-white/30"
                    />
                  </div>
                )}

                {filteredSubs.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {filteredSubs.map((sub) => {
                      const savedSub = downloads.some(
                        (d) => d.url === sub.url && d.status === 'completed',
                      );
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-[#181818] border border-white/[0.06] px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-[#8c8c8c] shrink-0" />
                            <span className="text-xs font-medium text-[#f2f2f2] truncate">
                              {sub.language}
                            </span>
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-white/[0.08] text-[#b3b3b3]">
                              {sub.langCode}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSubtitleDownload(sub)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-[11px] font-semibold text-white transition shrink-0"
                          >
                            {savedSub ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                <span>.SRT</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#8c8c8c] py-2">
                    {subtitles.length === 0
                      ? 'No external subtitle files found for this episode.'
                      : 'No languages match your filter.'}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
