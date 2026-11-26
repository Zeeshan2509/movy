import React, { useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Film,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useDownloadManager } from '@/src/context/DownloadContext';
import { formatDownloadBytes } from '@/src/services/streamResolver';
import type { DownloadRecord } from '@/src/types/media';

function formatTimeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const DownloadsModal: React.FC = () => {
  const {
    downloads,
    activeDownloads,
    historyDownloads,
    downloadsOpen,
    setDownloadsOpen,
    cancelDownload,
    retryDownload,
    removeDownload,
    clearHistory,
  } = useDownloadManager();

  useEffect(() => {
    if (!downloadsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDownloadsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [downloadsOpen, setDownloadsOpen]);

  if (!downloadsOpen) return null;

  const renderItem = (rec: DownloadRecord) => {
    const isDownloading = rec.status === 'downloading';
    const isCompleted = rec.status === 'completed';
    const isFailed = rec.status === 'failed' || rec.status === 'cancelled';

    return (
      <div
        key={rec.id}
        className="rounded-xl bg-[#181818] border border-white/[0.08] p-3 flex items-start gap-3"
      >
        <div className="h-14 w-10 rounded-lg bg-[#0f0f0f] overflow-hidden shrink-0 flex items-center justify-center border border-white/[0.06]">
          {rec.posterUrl ? (
            <img
              src={rec.posterUrl}
              alt={rec.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : rec.kind === 'subtitle' ? (
            <FileText className="w-4 h-4 text-[#8c8c8c]" />
          ) : (
            <Film className="w-4 h-4 text-[#8c8c8c]" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{rec.title}</p>
              <p className="text-[11px] text-[#b3b3b3] truncate tabular-nums">
                {[rec.episodeLabel, rec.quality].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isDownloading ? (
                <button
                  type="button"
                  onClick={() => cancelDownload(rec.id)}
                  className="h-7 px-2.5 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-[11px] font-semibold text-white transition"
                >
                  Cancel
                </button>
              ) : (
                <>
                  {isFailed && (
                    <button
                      type="button"
                      onClick={() => retryDownload(rec)}
                      title="Retry download"
                      aria-label="Retry download"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white/[0.08] hover:bg-white/[0.16] text-white transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeDownload(rec.id)}
                    title="Remove from history"
                    aria-label="Remove from history"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white/[0.04] hover:bg-white/[0.12] text-[#8c8c8c] hover:text-white transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {isDownloading ? (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#e50914] transition-all duration-200"
                  style={{ width: `${Math.max(4, rec.progress)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#b3b3b3] tabular-nums">
                <span className="truncate">{rec.statusText}</span>
                <span>
                  {rec.bytesDownloaded > 0
                    ? rec.totalBytes
                      ? `${formatDownloadBytes(rec.bytesDownloaded)} / ${formatDownloadBytes(rec.totalBytes)}`
                      : formatDownloadBytes(rec.bytesDownloaded)
                    : `${rec.progress}%`}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px] tabular-nums">
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  isCompleted ? 'text-emerald-400' : 'text-[#ff4651]'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                <span>{rec.statusText}</span>
              </span>
              <span className="text-[#8c8c8c]">
                {[
                  rec.bytesDownloaded > 0 ? formatDownloadBytes(rec.bytesDownloaded) : null,
                  formatTimeAgo(rec.completedAt ?? rec.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Downloads & History"
      onClick={() => setDownloadsOpen(false)}
    >
      <div
        className="w-full sm:max-w-[480px] rounded-t-2xl sm:rounded-2xl bg-[#141414] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white leading-tight">
                Downloads
              </h2>
              <p className="text-xs text-[#b3b3b3] tabular-nums">
                {activeDownloads.length > 0
                  ? `${activeDownloads.length} active · ${historyDownloads.length} saved`
                  : `${downloads.length} saved on this device`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {historyDownloads.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#181818] hover:bg-[#242424] border border-white/10 text-[11px] font-medium text-[#b3b3b3] hover:text-white transition"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDownloadsOpen(false)}
              aria-label="Close downloads"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[#8c8c8c] hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
          {downloads.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#181818] border border-white/[0.08] text-[#8c8c8c]">
                <Download className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-white">No downloads yet</p>
              <p className="text-xs text-[#8c8c8c] max-w-xs mx-auto">
                Open any movie, TV episode, or anime and tap Download to save video files or
                subtitles here.
              </p>
            </div>
          ) : (
            <>
              {activeDownloads.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c8c8c]">
                    In Progress ({activeDownloads.length})
                  </h3>
                  <div className="space-y-2">{activeDownloads.map(renderItem)}</div>
                </section>
              )}

              {historyDownloads.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c8c8c]">
                    History ({historyDownloads.length})
                  </h3>
                  <div className="space-y-2">{historyDownloads.map(renderItem)}</div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
