import type {
  MediaEpisode,
  MediaItem,
  StreamSourceOption,
  SubtitleTrack,
} from '@/src/types/media';

const SUBTITLES_API_URL = 'https://subtitles.vidy.st';

let cachedProxyOriginPromise: Promise<string> | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getStreamProxyOrigin(): Promise<string> {
  if (!isTauriRuntime()) return '';
  if (!cachedProxyOriginPromise) {
    cachedProxyOriginPromise = import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string>('get_proxy_origin'))
      .catch(() => '');
  }
  const origin = await cachedProxyOriginPromise;
  if (!origin) {
    cachedProxyOriginPromise = null;
  }
  return origin;
}

export function normalizeStreamUrl(url: string, proxyOrigin: string): string {
  if (!url) return url;
  if (proxyOrigin && url.startsWith('/api/streams/')) {
    return `${proxyOrigin}${url}`;
  }
  return url;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(text)) {
    throw new Error('Stream backend endpoint is unavailable');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response from stream backend');
  }
}

export interface MovyServerMeta {
  id: string;
  name: string;
  tag: string;
  note: string;
  flagCode: 'us' | 'de' | 'fr' | 'in' | 'mx' | string;
  languageParam?: string;
  isPrimaryEnglish?: boolean;
}

export interface ResolvedBackendServer {
  id: string;
  name: string;
  tag: string;
  note: string;
  flagCode: string;
  sources: StreamSourceOption[];
}

export const MOVY_SERVERS: readonly MovyServerMeta[] = [
  { id: 'miami', name: 'Miami', tag: 'miami', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'boise', name: 'Boise', tag: 'boise', note: 'Original audio. May have 4K', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'nashville', name: 'Nashville', tag: 'nashville', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'chicago', name: 'Chicago', tag: 'chicago', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'vegas', name: 'Vegas', tag: 'vegas', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'reno', name: 'Reno', tag: 'reno', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'oakland', name: 'Oakland', tag: 'oakland', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
  { id: 'seattle', name: 'Seattle', tag: 'seattle', note: 'Original audio', flagCode: 'us', isPrimaryEnglish: true },
];

export function flagSvgUrl(countryCode: string): string {
  const codeMap: Record<string, string> = { pb: 'br', ea: 'mx', gb: 'gb', us: 'us' };
  const cleaned = (countryCode || 'us').toLowerCase();
  const normalized = codeMap[cleaned] || cleaned;
  return `https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${normalized}.svg`;
}

export function compareQualityLabels(a: string, b: string): number {
  const rank = (q: string) => {
    const low = q.toLowerCase();
    if (low.includes('4k') || low.includes('2160')) return 2160;
    const m = low.match(/(\d{3,4})/);
    if (m) return Number(m[1]);
    if (low.includes('original') || low.includes('hd')) return 720;
    if (low.includes('auto')) return 9999;
    return 480;
  };
  return rank(b) - rank(a);
}

export function formatDownloadBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${idx < 2 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function getQualityTierTag(quality: string): string | null {
  const q = quality.toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return '4K UHD';
  if (q.includes('1440')) return 'QHD';
  if (q.includes('1080')) return 'Full HD';
  if (q.includes('720')) return 'HD';
  if (q.includes('480') || q.includes('360')) return 'SD';
  return null;
}

function mapDimensionsToQuality(width: number, height: number): string {
  if (width >= 3800 || height >= 2100) return '2160p';
  if (width >= 2500 || height >= 1400) return '1440p';
  if (width >= 1900 || height >= 1000) return '1080p';
  if (width >= 1200 || height >= 700) return '720p';
  if (width >= 800 || height >= 450) return '480p';
  if (width >= 580 || height >= 320) return '360p';
  return height > 0 ? `${height}p` : 'SD';
}

function mapBandwidthToQuality(bw: number): string {
  if (bw >= 8000000) return '2160p';
  if (bw >= 4500000) return '1440p';
  if (bw >= 2400000) return '1080p';
  if (bw >= 1200000) return '720p';
  if (bw >= 650000) return '480p';
  return '360p';
}

function decodeRepeatedly(input: string, passes = 2): string {
  let out = input;
  for (let i = 0; i < passes; i += 1) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

function inferQualityFromText(raw: string): string | null {
  if (!raw) return null;
  const decoded = decodeRepeatedly(raw, 3);
  const resMatch = decoded.match(
    /(?:^|[\/_.\-\[\(=\s])(2160|1440|1080|720|480|360)p?(?=$|[\/_.\-\]\)=\s&])/i,
  );
  if (resMatch) return `${resMatch[1]}p`;
  if (/(?:^|[\/_.\-\[\(=\s])4k(?=$|[\/_.\-\]\)=\s&])/i.test(decoded)) {
    return '2160p';
  }
  return null;
}

function toRelativeOrAbsoluteProxyUrl(uri: string, baseUrl: string): string {
  const base = new URL(baseUrl, window.location.origin);
  const resolved = new URL(uri, base);
  if (resolved.origin === window.location.origin) {
    return `${resolved.pathname}${resolved.search}`;
  }
  return resolved.toString();
}

export async function expandSourcesForDownload(
  sources: StreamSourceOption[],
  signal?: AbortSignal,
): Promise<StreamSourceOption[]> {
  if (sources.length === 0) return [];

  const expandedGroups = await Promise.all(
    sources.map(async (src): Promise<StreamSourceOption[]> => {
      const cleanLabel =
        src.serverName || src.label.replace(/\s*·\s*Auto$/i, '').trim() || src.label;

      if (src.kind !== 'hls') {
        const inferred =
          (src.quality && !/^(auto|default)$/i.test(src.quality) ? src.quality : null) ||
          inferQualityFromText(src.url) ||
          inferQualityFromText(src.label) ||
          'Original';
        return [
          {
            ...src,
            label: cleanLabel,
            quality: inferred,
          },
        ];
      }

      try {
        const res = await fetch(src.url, {
          signal: signal ?? AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        if (text.includes('#EXT-X-STREAM-INF')) {
          const lines = text.split(/\r?\n/);
          const variants: StreamSourceOption[] = [];
          const seenQualities = new Set<string>();

          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

            let uriLine = '';
            for (let j = i + 1; j < lines.length; j += 1) {
              const candidate = lines[j].trim();
              if (!candidate) continue;
              if (candidate.startsWith('#')) {
                if (candidate.startsWith('#EXT-X-STREAM-INF')) break;
                continue;
              }
              uriLine = candidate;
              break;
            }
            if (!uriLine) continue;

            const resAttr = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            const bwAttr = line.match(/BANDWIDTH=(\d+)/i);
            let quality = '720p';
            if (resAttr) {
              quality = mapDimensionsToQuality(Number(resAttr[1]), Number(resAttr[2]));
            } else if (bwAttr) {
              quality = mapBandwidthToQuality(Number(bwAttr[1]));
            } else {
              quality = inferQualityFromText(uriLine) || '720p';
            }

            if (seenQualities.has(quality)) continue;
            seenQualities.add(quality);

            variants.push({
              ...src,
              id: `${src.id}-${quality}`,
              label: cleanLabel,
              quality,
              url: toRelativeOrAbsoluteProxyUrl(uriLine, src.url),
            });
          }

          if (variants.length > 0) {
            variants.sort((a, b) => compareQualityLabels(a.quality, b.quality));
            return variants;
          }
        }

        const sampleText = text.split(/\r?\n/).slice(0, 20).join('\n');
        const inferred =
          (src.quality && !/^(auto|default)$/i.test(src.quality) ? src.quality : null) ||
          inferQualityFromText(sampleText) ||
          inferQualityFromText(src.url) ||
          'HD';
        return [
          {
            ...src,
            label: cleanLabel,
            quality: inferred,
          },
        ];
      } catch {
        const fallbackQuality =
          (src.quality && !/^(auto|default)$/i.test(src.quality) ? src.quality : null) ||
          inferQualityFromText(src.url) ||
          'HD';
        return [
          {
            ...src,
            label: cleanLabel,
            quality: fallbackQuality,
          },
        ];
      }
    }),
  );

  return expandedGroups.flat();
}

export async function fetchBackendMovieTvSources(
  item: MediaItem,
  seasonNumber = 1,
  episodeNumber = 1,
  preferredServerId?: string,
  signal?: AbortSignal,
): Promise<{
  servers: ResolvedBackendServer[];
  sources: StreamSourceOption[];
  subtitles: SubtitleTrack[];
  activeServerId: string | null;
  errorReason?: string;
}> {
  const tmdbId = item.tmdbId ?? (typeof item.id === 'number' ? item.id : '');
  const imdbId = item.imdbId ?? '';
  const type = item.mediaType === 'tv' ? 'tv' : 'movie';

  const params = new URLSearchParams({
    type,
    season: String(seasonNumber || 1),
    episode: String(episodeNumber || 1),
  });
  if (tmdbId) params.set('tmdbId', String(tmdbId));
  if (imdbId) params.set('imdbId', String(imdbId));

  try {
    const proxyOrigin = await getStreamProxyOrigin();
    const res = await fetch(`${proxyOrigin}/api/streams/resolve?${params.toString()}`, {
      signal: signal ?? AbortSignal.timeout(18000),
    });
    if (!res.ok) {
      return {
        servers: [],
        sources: [],
        subtitles: [],
        activeServerId: null,
        errorReason: `Server HTTP ${res.status}`,
      };
    }

    const data = await parseJsonResponse<{
      servers?: ResolvedBackendServer[];
      error?: string;
    }>(res);

    const servers = (data.servers || [])
      .filter((s) => s.sources?.length > 0)
      .map((s) => ({
        ...s,
        sources: s.sources.map((src) => ({
          ...src,
          url: normalizeStreamUrl(src.url, proxyOrigin),
        })),
      }));

    if (servers.length === 0) {
      return {
        servers: [],
        sources: [],
        subtitles: [],
        activeServerId: null,
        errorReason: data.error || 'No working stream returned by upstream nodes',
      };
    }

    const chosen =
      (preferredServerId && servers.find((s) => s.id === preferredServerId || s.tag === preferredServerId)) ||
      servers[0];

    return {
      servers,
      sources: chosen.sources,
      subtitles: [],
      activeServerId: chosen.id,
    };
  } catch (err) {
    return {
      servers: [],
      sources: [],
      subtitles: [],
      activeServerId: null,
      errorReason: (err as Error)?.message || 'Failed to connect to stream resolver',
    };
  }
}

export async function fetchDirectWecollegeSources(
  item: MediaItem,
  seasonNumber = 1,
  episodeNumber = 1,
  preferredServerId?: string,
  _onServerStatus?: (serverId: string, status: 'loading' | 'success' | 'error') => void,
  signal?: AbortSignal,
) {
  return fetchBackendMovieTvSources(item, seasonNumber, episodeNumber, preferredServerId, signal);
}

export async function fetchAnimeEpisodeStream(
  episode: MediaEpisode,
  audioType: 'sub' | 'dub' = 'sub',
  signal?: AbortSignal,
): Promise<{ sources: StreamSourceOption[]; subtitles: SubtitleTrack[] }> {
  if (!episode.animeServerIds) {
    return { sources: [], subtitles: [] };
  }

  try {
    const proxyOrigin = await getStreamProxyOrigin();
    const params = new URLSearchParams({
      serverIds: episode.animeServerIds,
      audio: audioType,
    });
    const res = await fetch(`${proxyOrigin}/api/streams/anime?${params.toString()}`, {
      signal: signal ?? AbortSignal.timeout(16000),
    });
    if (!res.ok) return { sources: [], subtitles: [] };
    const data = await parseJsonResponse<{
      sources?: StreamSourceOption[];
      subtitles?: SubtitleTrack[];
    }>(res);
    return {
      sources: (data.sources || []).map((src) => ({
        ...src,
        url: normalizeStreamUrl(src.url, proxyOrigin),
      })),
      subtitles: filterEnglishSubtitles(data.subtitles || []),
    };
  } catch {
    return { sources: [], subtitles: [] };
  }
}

export function isEnglishSubtitle(track: SubtitleTrack): boolean {
  if (track.type === 'upload' || track.server === 'upload') return true;
  const code = (track.langCode || '').trim().toLowerCase();
  const label = (track.language || '').trim().toLowerCase();
  if (code === 'en' || code === 'eng') return true;
  if (label.startsWith('english') || /\benglish\b/.test(label)) return true;
  return false;
}

export function filterEnglishSubtitles(tracks: SubtitleTrack[]): SubtitleTrack[] {
  return tracks.filter(isEnglishSubtitle);
}

export async function fetchLiveSubtitles(
  idOrImdb: number | string | undefined | null,
  mediaType: 'movie' | 'tv' | 'anime',
  seasonNumber = 1,
  episodeNumber = 1,
  signal?: AbortSignal,
): Promise<SubtitleTrack[]> {
  if (!idOrImdb) return [];
  try {
    let url = `${SUBTITLES_API_URL}/search?id=${encodeURIComponent(String(idOrImdb))}`;
    if (mediaType !== 'movie') {
      url += `&season=${seasonNumber}&episode=${episodeNumber}`;
    }
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(4500) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      id?: string;
      url?: string;
      display?: string;
      language?: string;
      flagUrl?: string;
      format?: string;
    }[];
    const mapped: SubtitleTrack[] = (data || [])
      .filter((d) => Boolean(d.url))
      .map((d, idx) => {
        const flagMatch = d.flagUrl?.match(/flagsapi\.com\/([A-Za-z]{2})\//i);
        const mappedFlag = flagMatch ? flagSvgUrl(flagMatch[1]) : d.flagUrl;
        const fmt = (d.format || '').toLowerCase();
        return {
          id: d.id || `sub-${idx}`,
          language: d.display || d.language || 'Subtitle',
          langCode: (d.language || 'en').slice(0, 2).toLowerCase(),
          url: d.url || '',
          type: fmt === 'vtt' || (d.url || '').toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
          flagUrl: mappedFlag,
          server: 'opensubtitles',
        };
      });
    return filterEnglishSubtitles(mapped);
  } catch {
    return [];
  }
}

// Keep signature compatibility for DownloadModal & other callers
export async function resolvePlayableStreams(options: {
  item: MediaItem;
  seasonNumber?: number;
  episodeNumber?: number;
  animeEpisode?: MediaEpisode | null;
  animeAudio?: 'sub' | 'dub';
  preferredServerId?: string;
  onServerStatus?: (serverId: string, status: 'loading' | 'success' | 'error') => void;
  signal?: AbortSignal;
}): Promise<{
  sources: StreamSourceOption[];
  subtitles: SubtitleTrack[];
  activeServerId: string | null;
}> {
  const {
    item,
    seasonNumber = 1,
    episodeNumber = 1,
    animeEpisode = null,
    animeAudio = 'sub',
    preferredServerId,
    onServerStatus,
    signal,
  } = options;

  const collectedSources: StreamSourceOption[] = [];
  let collectedSubs: SubtitleTrack[] = [];
  let activeServerId: string | null = null;

  if (item.mediaType === 'anime') {
    if (animeEpisode) {
      const animeRes = await fetchAnimeEpisodeStream(animeEpisode, animeAudio, signal);
      collectedSources.push(...animeRes.sources);
      collectedSubs.push(...animeRes.subtitles);
      if (animeRes.sources.length > 0) {
        activeServerId = animeRes.sources[0].serverTag ?? null;
      }
    }
    if (collectedSources.length === 0 && item.tmdbId) {
      const fallback = await fetchDirectWecollegeSources(
        { ...item, mediaType: 'tv' },
        seasonNumber,
        episodeNumber,
        preferredServerId,
        onServerStatus,
        signal,
      ).catch(() => ({ sources: [], subtitles: [], activeServerId: null }));
      collectedSources.push(...fallback.sources);
      if (collectedSubs.length === 0) collectedSubs = fallback.subtitles;
      activeServerId = fallback.activeServerId;
    }
    if (item.imdbId || item.tmdbId) {
      const liveSubs = await fetchLiveSubtitles(
        item.imdbId || item.tmdbId,
        'tv',
        seasonNumber,
        episodeNumber,
        signal,
      );
      if (liveSubs.length > 0) collectedSubs = [...collectedSubs, ...liveSubs];
    }
  } else {
    const subLookupId = item.imdbId || item.tmdbId || item.id;
    const [directRes, liveSubs] = await Promise.all([
      fetchDirectWecollegeSources(
        item,
        seasonNumber,
        episodeNumber,
        preferredServerId,
        onServerStatus,
        signal,
      ).catch(() => ({
        sources: [] as StreamSourceOption[],
        subtitles: [] as SubtitleTrack[],
        activeServerId: null,
      })),
      fetchLiveSubtitles(subLookupId, item.mediaType, seasonNumber, episodeNumber, signal),
    ]);

    collectedSources.push(...directRes.sources);
    activeServerId = directRes.activeServerId;
    collectedSubs = directRes.subtitles.length > 0 ? directRes.subtitles : liveSubs;
  }

  return {
    sources: collectedSources,
    subtitles: collectedSubs,
    activeServerId,
  };
}

// ---------- Subtitle Cue Parser (SRT + WebVTT) ----------

export interface SubtitleCue {
  from: number; // milliseconds
  to: number;   // milliseconds
  text: string;
}

function parseTimestampMs(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    }
  } else if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (Number.isFinite(m) && Number.isFinite(s)) {
      return Math.round((m * 60 + s) * 1000);
    }
  }
  return null;
}

export function sanitizeSubtitleHtml(rawText: string): string {
  return rawText
    .replace(/\{\\([ibu])\}/gi, '</$1>')
    .replace(/\{\\([ibu])1\}/gi, '<$1>')
    .replace(/\{([ibu])\}/gi, '<$1>')
    .replace(/\{\/([ibu])\}/gi, '</$1>')
    .replace(/<(?!\/?(?:b|i|u|br)\b)[^>]+>/gi, '')
    .replace(/\r?\n/g, '<br/>')
    .trim();
}

export function parseSubtitleCues(rawContent: string): SubtitleCue[] {
  if (!rawContent) return [];
  const normalized = rawContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) continue;

    const timingLine = lines[timingIdx];
    const [startRaw, endAndSettings] = timingLine.split('-->');
    if (!startRaw || !endAndSettings) continue;
    const endRaw = endAndSettings.trim().split(/\s+/)[0];

    const from = parseTimestampMs(startRaw);
    const to = parseTimestampMs(endRaw);
    if (from === null || to === null) continue;

    const text = lines.slice(timingIdx + 1).join('\n').trim();
    if (!text) continue;

    cues.push({ from, to, text: sanitizeSubtitleHtml(text) });
  }

  cues.sort((a, b) => a.from - b.from);
  return cues;
}

export function findActiveCueText(cues: SubtitleCue[], timeMs: number): string {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid];
    if (cue.from <= timeMs && cue.to >= timeMs) {
      return cue.text;
    }
    if (timeMs < cue.from) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return '';
}

export function convertRawSubtitleToVttBlobUrl(rawContent: string): string {
  const cleaned = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\{\\([ibu])\}/gi, '</$1>')
    .replace(/\{\\([ibu])1\}/gi, '<$1>')
    .replace(/\{([ibu])\}/gi, '<$1>')
    .replace(/\{\/([ibu])\}/gi, '</$1>')
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  const vtt = /^\s*WEBVTT/i.test(cleaned) ? cleaned : `WEBVTT\n\n${cleaned}`;
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt;charset=utf-8' }));
}

export async function downloadDirectVideoOrHls(options: {
  url: string;
  filename: string;
  onProgress?: (
    percent: number,
    label: string,
    bytesDownloaded?: number,
    totalBytes?: number | null,
  ) => void;
  signal?: AbortSignal;
}): Promise<{ bytesDownloaded: number; finalFilename: string }> {
  const { url, filename, onProgress, signal } = options;

  const isHlsPlaylist =
    url.includes('/api/streams/hls') || url.toLowerCase().includes('.m3u8');

  if (isHlsPlaylist) {
    onProgress?.(2, 'Reading HLS playlist...', 0, null);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Playlist HTTP ${res.status}`);
    const text = await res.text();
    const base = new URL(url, window.location.origin);

    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split(/\r?\n/);
      let bestUrl = '';
      let bestBw = -1;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
          const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
          const bw = bwMatch ? Number(bwMatch[1]) : 0;
          const next = lines[i + 1]?.trim();
          if (next && !next.startsWith('#') && bw >= bestBw) {
            bestBw = bw;
            bestUrl = new URL(next, base).toString();
          }
        }
      }
      if (bestUrl) {
        return downloadDirectVideoOrHls({ url: bestUrl, filename, onProgress, signal });
      }
    }

    const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const initUrl = mapMatch?.[1] ? new URL(mapMatch[1], base).toString() : null;

    const segmentUrls = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => new URL(l, base).toString());

    if (segmentUrls.length === 0) throw new Error('No segments found in HLS playlist');

    const orderedSegments: (Uint8Array | null)[] = new Array(segmentUrls.length).fill(null);
    let initChunk: Uint8Array | null = null;
    let totalBytes = 0;
    let completedCount = 0;

    if (initUrl) {
      const initRes = await fetch(initUrl, { signal });
      if (initRes.ok) {
        initChunk = new Uint8Array(await initRes.arrayBuffer());
        totalBytes += initChunk.byteLength;
      }
    }

    const CONCURRENCY = 4;
    for (let start = 0; start < segmentUrls.length; start += CONCURRENCY) {
      if (signal?.aborted) throw new Error('Download cancelled');
      const end = Math.min(segmentUrls.length, start + CONCURRENCY);
      await Promise.all(
        Array.from({ length: end - start }, async (_v, offsetIdx) => {
          const idx = start + offsetIdx;
          const segRes = await fetch(segmentUrls[idx], { signal });
          if (!segRes.ok) throw new Error(`Segment ${idx + 1} failed`);
          const buf = new Uint8Array(await segRes.arrayBuffer());
          orderedSegments[idx] = buf;
          totalBytes += buf.byteLength;
          completedCount += 1;
          onProgress?.(
            Math.min(98, Math.round((completedCount / segmentUrls.length) * 100)),
            `Segment ${completedCount} / ${segmentUrls.length}`,
            totalBytes,
            null,
          );
        }),
      );
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    if (initChunk) {
      merged.set(initChunk, offset);
      offset += initChunk.byteLength;
    }
    for (const c of orderedSegments) {
      if (!c) continue;
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const isMp4 = Boolean(initChunk);
    const finalFilename =
      filename.replace(/\.(mp4|mkv|ts)$/i, '') + (isMp4 ? '.mp4' : '.ts');
    const blob = new Blob([merged], { type: isMp4 ? 'video/mp4' : 'video/mp2t' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    onProgress?.(100, 'Saved to device', totalBytes, totalBytes);
    return { bytesDownloaded: totalBytes, finalFilename };
  }

  onProgress?.(5, 'Connecting to stream...', 0, null);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);

  const contentLengthHeader = res.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
  let loadedBytes = 0;
  let blob: Blob;

  if (res.body) {
    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        throw new Error('Download cancelled');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        loadedBytes += value.byteLength;
        const pct = totalBytes
          ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
          : 50;
        onProgress?.(
          pct,
          totalBytes ? `Downloading (${pct}%)` : 'Downloading video...',
          loadedBytes,
          totalBytes,
        );
      }
    }
    blob = new Blob(parts, { type: res.headers.get('content-type') || 'video/mp4' });
  } else {
    blob = await res.blob();
    loadedBytes = blob.size;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  onProgress?.(100, 'Saved to device', loadedBytes, totalBytes ?? loadedBytes);
  return { bytesDownloaded: loadedBytes, finalFilename: filename };
}

export async function downloadSubtitleFile(options: {
  url: string;
  filename: string;
  signal?: AbortSignal;
}): Promise<{ bytesDownloaded: number; finalFilename: string }> {
  const { url, filename, signal } = options;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return { bytesDownloaded: blob.size, finalFilename: filename };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { bytesDownloaded: 0, finalFilename: filename };
  }
}

export async function getDefaultDownloadDir(): Promise<string> {
  if (!isTauriRuntime()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_default_download_dir');
  } catch {
    return '';
  }
}

export async function pickDownloadFolder(currentDir?: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string | null>('pick_download_folder', {
      currentDir: currentDir || null,
    });
  } catch {
    return null;
  }
}

export async function cancelTauriDownload(downloadId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('cancel_tauri_download', { downloadId });
  } catch {
    // Ignore
  }
}

export interface TauriProgressPayload {
  id: string;
  percent: number;
  label: string;
  bytesDownloaded: number;
  totalBytes: number | null;
}

export async function downloadViaTauriToDisk(options: {
  downloadId: string;
  url: string;
  saveDir: string;
  filename: string;
  onProgress?: (payload: TauriProgressPayload) => void;
}): Promise<{ bytesDownloaded: number; finalFilename: string; fullPath: string }> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  let unlisten: (() => void) | null = null;
  if (options.onProgress) {
    unlisten = await listen<TauriProgressPayload>('download-progress', (event) => {
      if (event.payload && event.payload.id === options.downloadId) {
        options.onProgress?.(event.payload);
      }
    });
  }

  try {
    const res = await invoke<{
      bytesDownloaded: number;
      finalFilename: string;
      fullPath: string;
    }>('download_file_to_path', {
      downloadId: options.downloadId,
      url: options.url,
      saveDir: options.saveDir,
      filename: options.filename,
    });
    return res;
  } finally {
    if (unlisten) unlisten();
  }
}
