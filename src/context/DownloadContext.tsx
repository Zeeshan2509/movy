import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  downloadDirectVideoOrHls,
  downloadSubtitleFile,
} from '@/src/services/streamResolver';
import type { DownloadRecord, MediaItem, SubtitleTrack } from '@/src/types/media';

const STORAGE_KEY = 'moviesx_downloads_v1';
const MAX_DOWNLOAD_RECORDS = 60;

interface StartVideoDownloadInput {
  item: MediaItem;
  episodeLabel?: string | null;
  quality: string;
  filename: string;
  url: string;
}

interface StartSubtitleDownloadInput {
  item: MediaItem;
  episodeLabel?: string | null;
  subtitle: SubtitleTrack;
  filename: string;
}

interface DownloadContextValue {
  downloads: DownloadRecord[];
  activeDownloads: DownloadRecord[];
  historyDownloads: DownloadRecord[];
  overallProgress: number;
  downloadsOpen: boolean;
  setDownloadsOpen: (open: boolean) => void;
  startVideoDownload: (input: StartVideoDownloadInput) => string;
  startSubtitleDownload: (input: StartSubtitleDownloadInput) => Promise<void>;
  cancelDownload: (id: string) => void;
  retryDownload: (record: DownloadRecord) => void;
  removeDownload: (id: string) => void;
  clearHistory: () => void;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

function readStoredDownloads(): DownloadRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (d): d is DownloadRecord =>
          Boolean(d && typeof d === 'object' && d.id && d.title && d.url),
      )
      .map((d) =>
        d.status === 'downloading'
          ? {
              ...d,
              status: 'cancelled' as const,
              statusText: 'Interrupted — tap Retry',
            }
          : d,
      )
      .slice(0, MAX_DOWNLOAD_RECORDS);
  } catch {
    return [];
  }
}

function writeStoredDownloads(records: DownloadRecord[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_DOWNLOAD_RECORDS)),
    );
  } catch {
    // Ignore storage quota issues in WebView
  }
}

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadRecord[]>(() => readStoredDownloads());
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    writeStoredDownloads(downloads);
  }, [downloads]);

  const updateRecord = useCallback((id: string, patch: Partial<DownloadRecord>) => {
    setDownloads((prev) =>
      prev.map((rec) => (rec.id === id ? { ...rec, ...patch } : rec)),
    );
  }, []);

  const executeVideoTransfer = useCallback(
    (id: string, url: string, filename: string) => {
      controllersRef.current.get(id)?.abort();
      const controller = new AbortController();
      controllersRef.current.set(id, controller);

      downloadDirectVideoOrHls({
        url,
        filename,
        signal: controller.signal,
        onProgress: (percent, label, bytesDownloaded = 0, totalBytes = null) => {
          updateRecord(id, {
            progress: percent,
            statusText: label,
            bytesDownloaded,
            totalBytes,
          });
        },
      })
        .then(({ bytesDownloaded, finalFilename }) => {
          updateRecord(id, {
            status: 'completed',
            progress: 100,
            statusText: 'Saved to device',
            bytesDownloaded,
            filename: finalFilename,
            completedAt: Date.now(),
          });
        })
        .catch((err) => {
          const msg = (err as Error)?.message || '';
          if (msg === 'Download cancelled' || controller.signal.aborted) {
            updateRecord(id, {
              status: 'cancelled',
              statusText: 'Cancelled',
            });
          } else {
            updateRecord(id, {
              status: 'failed',
              statusText: 'Blocked by host node — tap Retry',
            });
          }
        })
        .finally(() => {
          controllersRef.current.delete(id);
        });
    },
    [updateRecord],
  );

  const startVideoDownload = useCallback(
    (input: StartVideoDownloadInput) => {
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const record: DownloadRecord = {
        id,
        title: input.item.title,
        mediaType: input.item.mediaType,
        posterUrl: input.item.posterUrl,
        episodeLabel: input.episodeLabel ?? null,
        quality: input.quality,
        kind: 'video',
        filename: input.filename,
        url: input.url,
        status: 'downloading',
        progress: 2,
        statusText: 'Starting download...',
        bytesDownloaded: 0,
        totalBytes: null,
        createdAt: Date.now(),
      };

      setDownloads((prev) => [record, ...prev].slice(0, MAX_DOWNLOAD_RECORDS));
      executeVideoTransfer(id, input.url, input.filename);
      return id;
    },
    [executeVideoTransfer],
  );

  const startSubtitleDownload = useCallback(
    async (input: StartSubtitleDownloadInput) => {
      const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const record: DownloadRecord = {
        id,
        title: input.item.title,
        mediaType: input.item.mediaType,
        posterUrl: input.item.posterUrl,
        episodeLabel: input.episodeLabel ?? null,
        quality: `${input.subtitle.language} (.SRT)`,
        kind: 'subtitle',
        filename: input.filename,
        url: input.subtitle.url,
        status: 'downloading',
        progress: 40,
        statusText: 'Saving subtitle...',
        bytesDownloaded: 0,
        totalBytes: null,
        createdAt: Date.now(),
      };
      setDownloads((prev) => [record, ...prev].slice(0, MAX_DOWNLOAD_RECORDS));

      try {
        const { bytesDownloaded, finalFilename } = await downloadSubtitleFile({
          url: input.subtitle.url,
          filename: input.filename,
        });
        updateRecord(id, {
          status: 'completed',
          progress: 100,
          statusText: 'Saved subtitle',
          bytesDownloaded,
          filename: finalFilename,
          completedAt: Date.now(),
        });
      } catch {
        updateRecord(id, {
          status: 'failed',
          statusText: 'Subtitle transfer failed',
        });
      }
    },
    [updateRecord],
  );

  const cancelDownload = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(id);
    }
    setDownloads((prev) =>
      prev.map((rec) =>
        rec.id === id
          ? { ...rec, status: 'cancelled', statusText: 'Cancelled' }
          : rec,
      ),
    );
  }, []);

  const retryDownload = useCallback(
    (record: DownloadRecord) => {
      if (record.kind === 'subtitle') {
        updateRecord(record.id, {
          status: 'downloading',
          progress: 40,
          statusText: 'Retrying subtitle...',
        });
        downloadSubtitleFile({ url: record.url, filename: record.filename })
          .then(({ bytesDownloaded }) => {
            updateRecord(record.id, {
              status: 'completed',
              progress: 100,
              statusText: 'Saved subtitle',
              bytesDownloaded,
              completedAt: Date.now(),
            });
          })
          .catch(() => {
            updateRecord(record.id, {
              status: 'failed',
              statusText: 'Subtitle transfer failed',
            });
          });
        return;
      }

      updateRecord(record.id, {
        status: 'downloading',
        progress: 2,
        bytesDownloaded: 0,
        statusText: 'Reconnecting...',
      });
      executeVideoTransfer(record.id, record.url, record.filename);
    },
    [executeVideoTransfer, updateRecord],
  );

  const removeDownload = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    setDownloads((prev) => prev.filter((rec) => rec.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setDownloads((prev) => prev.filter((rec) => rec.status === 'downloading'));
  }, []);

  const activeDownloads = useMemo(
    () => downloads.filter((d) => d.status === 'downloading'),
    [downloads],
  );

  const historyDownloads = useMemo(
    () => downloads.filter((d) => d.status !== 'downloading'),
    [downloads],
  );

  const overallProgress = useMemo(() => {
    if (activeDownloads.length === 0) return 0;
    const sum = activeDownloads.reduce((acc, d) => acc + d.progress, 0);
    return Math.round(sum / activeDownloads.length);
  }, [activeDownloads]);

  const value = useMemo<DownloadContextValue>(
    () => ({
      downloads,
      activeDownloads,
      historyDownloads,
      overallProgress,
      downloadsOpen,
      setDownloadsOpen,
      startVideoDownload,
      startSubtitleDownload,
      cancelDownload,
      retryDownload,
      removeDownload,
      clearHistory,
    }),
    [
      downloads,
      activeDownloads,
      historyDownloads,
      overallProgress,
      downloadsOpen,
      startVideoDownload,
      startSubtitleDownload,
      cancelDownload,
      retryDownload,
      removeDownload,
      clearHistory,
    ],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
};

export function useDownloadManager(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) {
    throw new Error('useDownloadManager must be used within DownloadProvider');
  }
  return ctx;
}
