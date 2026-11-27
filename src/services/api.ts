import { CATALOG_ITEMS } from '@/src/data/catalog';
import type {
  MediaCastMember,
  MediaEpisode,
  MediaItem,
  MediaType,
  MediaVideo,
  PaginatedResult,
} from '@/src/types/media';

const TMDB_BASE = 'https://db.wecollege.net/3';
const ANIME_BASE = 'https://anime.vidy.st/api';

const CACHE_TTL_MS = 1000 * 60 * 15; // 15 min memory cache
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
const inflightRequests = new Map<string, Promise<unknown>>();

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

const SAMPLE_FALLBACK_STREAMS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
];

function getFallbackStream(id: number | string): string {
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return SAMPLE_FALLBACK_STREAMS[hash % SAMPLE_FALLBACK_STREAMS.length];
}

export function tmdbImageUrl(
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w342',
  widthHint?: number,
): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const rawUrl = `https://image.tmdb.org/t/p/${size}${cleanPath}`;
  const q = size === 'original' ? 80 : 65;
  const wParam = widthHint ? `&w=${widthHint}` : '';
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&output=webp&q=${q}&n=-1${wParam}`;
}

async function fetchJsonCached<T>(url: string, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const inflight = inflightRequests.get(url);
  if (inflight && !signal) {
    return inflight as Promise<T>;
  }

  const promise = (async () => {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) for ${url}`);
    }
    const json = (await res.json()) as T;
    responseCache.set(url, { data: json, expiresAt: Date.now() + CACHE_TTL_MS });
    return json;
  })();

  if (!signal) {
    inflightRequests.set(url, promise);
  }

  try {
    return await promise;
  } finally {
    inflightRequests.delete(url);
  }
}

// ---------- TMDB Mapping ----------

interface RawTmdbItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  origin_country?: string[];
  original_language?: string;
  runtime?: number | null;
  number_of_seasons?: number | null;
  seasons?: { season_number: number }[];
  tagline?: string | null;
  status?: string | null;
  next_episode_to_air?: {
    season_number: number;
    episode_number: number;
    air_date?: string;
  } | null;
  last_episode_to_air?: {
    season_number: number;
    episode_number: number;
    air_date?: string;
  } | null;
  credits?: {
    cast?: {
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }[];
  };
  videos?: {
    results?: {
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
    }[];
  };
  images?: {
    logos?: {
      file_path: string;
      iso_639_1?: string | null;
      width?: number;
    }[];
  };
  recommendations?: {
    results?: RawTmdbItem[];
  };
  external_ids?: {
    imdb_id?: string | null;
  };
}

interface RawTmdbListResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: RawTmdbItem[];
}

function inferTmdbMediaType(raw: RawTmdbItem, forcedType?: MediaType): MediaType {
  if (forcedType) return forcedType;
  if (raw.media_type === 'movie') return 'movie';
  if (raw.media_type === 'tv') return 'tv';
  if (raw.title && !raw.name) return 'movie';
  return 'tv';
}

export function mapTmdbToMediaItem(
  raw: RawTmdbItem,
  forcedType?: MediaType,
  heroBackdrop = false,
): MediaItem {
  const mediaType = inferTmdbMediaType(raw, forcedType);
  const title = raw.title || raw.name || raw.original_title || raw.original_name || 'Untitled';
  const releaseDate = raw.release_date || raw.first_air_date || '';
  const year = releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) || 2026 : 2026;
  const genreIds =
    raw.genre_ids ||
    (Array.isArray(raw.genres) ? raw.genres.map((g) => g.id) : []);
  const genres =
    Array.isArray(raw.genres) && raw.genres.length > 0
      ? raw.genres.map((g) => g.name)
      : genreIds.map((id) => TMDB_GENRE_MAP[id]).filter(Boolean);

  const epSource = raw.next_episode_to_air || raw.last_episode_to_air;
  const episodeCode = epSource
    ? `S${epSource.season_number}.E${epSource.episode_number}`
    : null;

  const enLogo =
    raw.images?.logos?.find((l) => l.iso_639_1 === 'en' && !l.file_path.endsWith('.svg')) ||
    raw.images?.logos?.find((l) => !l.file_path.endsWith('.svg'));

  const cast: MediaCastMember[] | undefined = raw.credits?.cast
    ?.slice(0, 10)
    .map((member) => ({
      id: member.id,
      name: member.name,
      character: member.character || '',
      profileUrl: member.profile_path ? tmdbImageUrl(member.profile_path, 'w185') : null,
    }));

  const videos: MediaVideo[] | undefined = raw.videos?.results
    ?.filter((v) => v.site === 'YouTube' && Boolean(v.key))
    .sort((a, b) => {
      const score = (type: string) =>
        type === 'Trailer' ? 0 : type === 'Teaser' ? 1 : type === 'Clip' ? 2 : 3;
      return score(a.type) - score(b.type);
    });

  const seasonNumbers = Array.isArray(raw.seasons)
    ? raw.seasons
        .map((s) => s.season_number)
        .filter((num) => typeof num === 'number' && num > 0)
        .sort((a, b) => a - b)
    : undefined;

  const recommendations = raw.recommendations?.results
    ?.filter((r) => Boolean(r.poster_path))
    .slice(0, 8)
    .map((r) => mapTmdbToMediaItem(r, mediaType));

  return {
    id: raw.id,
    tmdbId: raw.id,
    imdbId: raw.external_ids?.imdb_id ?? null,
    title,
    originalTitle: raw.original_title || raw.original_name || undefined,
    mediaType,
    posterUrl: tmdbImageUrl(raw.poster_path, 'w342'),
    backdropUrl: heroBackdrop
      ? tmdbImageUrl(raw.backdrop_path || raw.poster_path, 'original', 1920)
      : tmdbImageUrl(raw.backdrop_path || raw.poster_path, 'w780'),
    logoUrl: enLogo ? tmdbImageUrl(enLogo.file_path, 'w500') : null,
    description:
      raw.overview?.trim() ||
      `${title} (${year}) — ${genres.slice(0, 2).join(' / ') || 'Featured Title'}.`,
    rating: Number((raw.vote_average ?? 0).toFixed(1)),
    year,
    releaseDate,
    genreIds,
    genres: genres.length > 0 ? genres : [mediaType === 'movie' ? 'Movie' : 'Series'],
    certification: mediaType === 'movie' ? 'PG-13' : 'TV-14',
    runtime: raw.runtime ?? null,
    seasons: raw.number_of_seasons ?? null,
    seasonNumbers,
    tag: null,
    episodeCode,
    episodeAirDate: epSource?.air_date ?? null,
    streamUrl: getFallbackStream(raw.id),
    tagline: raw.tagline ?? null,
    status: raw.status ?? null,
    cast,
    videos,
    recommendations,
  };
}

// ---------- TMDB Public Queries ----------

export async function fetchTrendingAll(
  timeWindow: 'day' | 'week' = 'day',
  page = 1,
): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/trending/all/${timeWindow}?language=en-US&page=${page}`,
  );
  const items = (data.results || [])
    .filter((r) => r.media_type !== 'person' && (r.poster_path || r.backdrop_path))
    .map((r) => mapTmdbToMediaItem(r));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchHeroBillboardItems(): Promise<MediaItem[]> {
  const trending = await fetchTrendingAll('day', 1);
  const candidates = trending.items.filter((i) => Boolean(i.backdropUrl)).slice(0, 6);

  const enriched = await Promise.all(
    candidates.map(async (item) => {
      try {
        const type = item.mediaType === 'movie' ? 'movie' : 'tv';
        const detail = await fetchJsonCached<RawTmdbItem>(
          `${TMDB_BASE}/${type}/${item.id}?append_to_response=images,videos&include_image_language=en,null`,
        );
        return mapTmdbToMediaItem(detail, item.mediaType, true);
      } catch {
        return item;
      }
    }),
  );

  return enriched;
}

export async function fetchTrendingByType(
  mediaType: 'movie' | 'tv',
  timeWindow: 'day' | 'week' = 'week',
  page = 1,
): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/trending/${mediaType}/${timeWindow}?language=en-US&page=${page}`,
  );
  const items = (data.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) => mapTmdbToMediaItem(r, mediaType));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchTopRated(
  mediaType: 'movie' | 'tv',
  page = 1,
): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/${mediaType}/top_rated?language=en-US&page=${page}`,
  );
  const items = (data.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) => mapTmdbToMediaItem(r, mediaType));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchOnTheAirTv(page = 1): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/tv/on_the_air?language=en-US&page=${page}`,
  );
  const items = (data.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) => mapTmdbToMediaItem(r, 'tv'));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchNetworkCatalog(
  networkIds: string,
  page = 1,
): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/discover/tv?with_networks=${encodeURIComponent(
      networkIds,
    )}&sort_by=popularity.desc&language=en-US&page=${page}`,
  );
  const items = (data.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) => mapTmdbToMediaItem(r, 'tv'));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export type BrowseSortKey = 'popular' | 'top_rated' | 'newest' | 'now_playing';

export async function fetchDiscoverCatalog(options: {
  mediaType: 'movie' | 'tv';
  page?: number;
  sort?: BrowseSortKey;
  genreId?: number | null;
}): Promise<PaginatedResult<MediaItem>> {
  const { mediaType, page = 1, sort = 'popular', genreId = null } = options;

  if (sort === 'now_playing') {
    const endpoint = mediaType === 'movie' ? '/movie/now_playing' : '/tv/on_the_air';
    const data = await fetchJsonCached<RawTmdbListResponse>(
      `${TMDB_BASE}${endpoint}?language=en-US&page=${page}`,
    );
    const filtered = (data.results || []).filter(
      (r) =>
        Boolean(r.poster_path) &&
        (!genreId || (r.genre_ids && r.genre_ids.includes(genreId))),
    );
    return {
      items: filtered.map((r) => mapTmdbToMediaItem(r, mediaType)),
      page: data.page || page,
      totalPages: Math.min(data.total_pages || 1, 500),
      totalResults: data.total_results || filtered.length,
    };
  }

  const params = new URLSearchParams({
    language: 'en-US',
    page: String(page),
    include_adult: 'false',
  });

  if (sort === 'top_rated') {
    params.set('sort_by', 'vote_average.desc');
    params.set('vote_count.gte', mediaType === 'movie' ? '300' : '150');
  } else if (sort === 'newest') {
    params.set(
      'sort_by',
      mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
    );
    params.set('vote_count.gte', '20');
  } else {
    params.set('sort_by', 'popularity.desc');
  }

  if (genreId) {
    params.set('with_genres', String(genreId));
  }

  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`,
  );

  const items = (data.results || [])
    .filter((r) => Boolean(r.poster_path))
    .map((r) => mapTmdbToMediaItem(r, mediaType));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchGenreCombinedCatalog(
  genreId: number,
  page = 1,
): Promise<PaginatedResult<MediaItem>> {
  const [moviesRes, tvRes] = await Promise.all([
    fetchDiscoverCatalog({ mediaType: 'movie', genreId, page, sort: 'popular' }),
    fetchDiscoverCatalog({ mediaType: 'tv', genreId, page, sort: 'popular' }),
  ]);

  const merged: MediaItem[] = [];
  const maxLen = Math.max(moviesRes.items.length, tvRes.items.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (moviesRes.items[i]) merged.push(moviesRes.items[i]);
    if (tvRes.items[i]) merged.push(tvRes.items[i]);
  }

  return {
    items: merged,
    page,
    totalPages: Math.max(moviesRes.totalPages, tvRes.totalPages),
    totalResults: moviesRes.totalResults + tvRes.totalResults,
  };
}

export async function searchTmdbMulti(
  query: string,
  page = 1,
  scope: 'all' | 'movie' | 'tv' = 'all',
  signal?: AbortSignal,
): Promise<PaginatedResult<MediaItem>> {
  const endpoint =
    scope === 'movie'
      ? '/search/movie'
      : scope === 'tv'
        ? '/search/tv'
        : '/search/multi';

  const data = await fetchJsonCached<RawTmdbListResponse>(
    `${TMDB_BASE}${endpoint}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`,
    signal,
  );

  const forcedType = scope === 'movie' ? 'movie' : scope === 'tv' ? 'tv' : undefined;
  const items = (data.results || [])
    .filter(
      (r) =>
        r.media_type !== 'person' &&
        Boolean(r.poster_path || r.backdrop_path),
    )
    .map((r) => mapTmdbToMediaItem(r, forcedType));

  return {
    items,
    page: data.page || page,
    totalPages: Math.min(data.total_pages || 1, 500),
    totalResults: data.total_results || items.length,
  };
}

export async function fetchTmdbDetail(item: MediaItem): Promise<MediaItem> {
  const type = item.mediaType === 'movie' ? 'movie' : 'tv';
  const id = item.tmdbId ?? item.id;
  const detail = await fetchJsonCached<RawTmdbItem>(
    `${TMDB_BASE}/${type}/${id}?append_to_response=credits,videos,recommendations,images,external_ids&include_image_language=en,null`,
  );
  return mapTmdbToMediaItem(detail, item.mediaType, true);
}

interface RawTmdbSeasonResponse {
  season_number: number;
  episodes?: {
    id: number;
    episode_number: number;
    season_number: number;
    name?: string;
    overview?: string;
    still_path?: string | null;
    air_date?: string | null;
    runtime?: number | null;
    vote_average?: number | null;
  }[];
}

export async function fetchTvSeasonEpisodes(
  tvId: number | string,
  seasonNumber: number,
): Promise<MediaEpisode[]> {
  const data = await fetchJsonCached<RawTmdbSeasonResponse>(
    `${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}?language=en-US`,
  );

  return (data.episodes || []).map((ep) => ({
    id: ep.id,
    episodeNumber: ep.episode_number,
    seasonNumber: ep.season_number ?? seasonNumber,
    title: ep.name || `Episode ${ep.episode_number}`,
    overview: ep.overview || '',
    stillUrl: ep.still_path ? tmdbImageUrl(ep.still_path, 'w342') : null,
    stillUrlLarge: ep.still_path ? tmdbImageUrl(ep.still_path, 'w780') : null,
    airDate: ep.air_date ?? null,
    runtime: ep.runtime ?? null,
    rating: typeof ep.vote_average === 'number' ? ep.vote_average : null,
  }));
}

// ---------- Anime API (https://anime.vidy.st/api) ----------

interface RawAnimeFilterItem {
  slug: string;
  title: string;
  poster?: string;
  type?: string;
  rating?: string | number;
  sub?: number;
  dub?: number;
  genres?: string[];
  aired?: string;
}

interface RawAnimeFilterResponse {
  success: boolean;
  results?: {
    data?: RawAnimeFilterItem[];
    totalPages?: number;
    currentPage?: number;
  };
}

const ANIME_BLOCKED_GENRES = new Set(['Hentai', 'Erotica']);

const ANIME_SORT_MAP: Record<'popular' | 'rating' | 'updated' | 'added' | 'name', string> = {
  popular: 'most-viewed',
  rating: 'score',
  updated: 'latest-updated',
  added: 'latest-added',
  name: 'name-az',
};

function cleanAnimeSlug(slug: string): string {
  return (slug || '').split('/')[0];
}

function parseAnimeYear(aired?: string): number {
  if (!aired) return 2025;
  const match = aired.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : 2025;
}

function parseAnimeRating(raw?: string | number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 7.8;
  if (!raw) return 7.8;
  const match = String(raw).match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number.parseFloat(match[0]) : 7.8;
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(1)) : 7.8;
}

function mapAnimeFilterItem(raw: RawAnimeFilterItem): MediaItem {
  const slug = cleanAnimeSlug(raw.slug);
  const year = parseAnimeYear(raw.aired);
  return {
    id: `anime:${slug}`,
    animeSlug: slug,
    title: raw.title,
    mediaType: 'anime',
    posterUrl: raw.poster || '',
    backdropUrl: raw.poster || '',
    description: `${raw.title} — Stream Japanese anime in HD with Sub & Dub episodes on Moviesx.`,
    rating: parseAnimeRating(raw.rating),
    year,
    releaseDate: String(year),
    genreIds: [16],
    genres: raw.genres && raw.genres.length > 0 ? raw.genres : ['Anime', raw.type || 'Series'],
    certification: 'TV-14',
    runtime: null,
    seasons: 1,
    streamUrl: getFallbackStream(slug),
    episodesCount: { sub: raw.sub || 0, dub: raw.dub || 0 },
  };
}

export type AnimeSortKey = 'popular' | 'rating' | 'updated' | 'added' | 'name';

export async function fetchAnimeCatalog(options: {
  page?: number;
  sort?: AnimeSortKey;
  genre?: string | null;
} = {}): Promise<PaginatedResult<MediaItem>> {
  const { page = 1, sort = 'popular', genre = null } = options;
  const params = new URLSearchParams({
    page: String(page),
    sort: ANIME_SORT_MAP[sort] || 'most-viewed',
  });
  if (genre) {
    params.set('genre', genre);
  }

  const data = await fetchJsonCached<RawAnimeFilterResponse>(
    `${ANIME_BASE}/filter?${params.toString()}`,
  );

  const list = (data.results?.data || []).filter(
    (entry) => !(entry.genres || []).some((g) => ANIME_BLOCKED_GENRES.has(g)),
  );
  const totalPages = data.results?.totalPages || 1;

  return {
    items: list.map(mapAnimeFilterItem),
    page,
    totalPages,
    totalResults: totalPages * 30,
  };
}

export async function searchAnimeCatalog(
  query: string,
  page = 1,
  signal?: AbortSignal,
): Promise<PaginatedResult<MediaItem>> {
  const data = await fetchJsonCached<RawAnimeFilterResponse>(
    `${ANIME_BASE}/search?keyword=${encodeURIComponent(query)}&page=${page}`,
    signal,
  );

  const list = (data.results?.data || []).filter(
    (entry) => !(entry.genres || []).some((g) => ANIME_BLOCKED_GENRES.has(g)),
  );
  const totalPages = data.results?.totalPages || 1;

  return {
    items: list.map(mapAnimeFilterItem),
    page,
    totalPages,
    totalResults: totalPages * Math.max(list.length, 1),
  };
}

interface RawAnimeInfoResponse {
  success: boolean;
  results?: {
    slug: string;
    animeId?: number;
    title: string;
    japaneseTitle?: string;
    poster?: string;
    backgroundImage?: string;
    synopsis?: string;
    type?: string;
    aired?: string;
    status?: string;
    malScore?: string;
    duration?: string;
    episodes?: { sub?: number; dub?: number };
    studios?: string[];
    genres?: string[];
    rating?: string;
  };
}

interface RawAnimeEpisodesResponse {
  success: boolean;
  results?: {
    totalEpisodes?: number;
    episodes?: {
      id: string;
      episode_no: number;
      title?: string;
      server_ids?: string;
    }[];
  };
}

export async function fetchAnimeDetailAndEpisodes(
  item: MediaItem,
): Promise<{ item: MediaItem; episodes: MediaEpisode[] }> {
  const slug = item.animeSlug || String(item.id).replace(/^anime:/, '');
  const [infoRes, epRes, tmdbVideoMatch] = await Promise.all([
    fetchJsonCached<RawAnimeInfoResponse>(
      `${ANIME_BASE}/info?id=${encodeURIComponent(slug)}`,
    ),
    fetchJsonCached<RawAnimeEpisodesResponse>(
      `${ANIME_BASE}/episodes/${encodeURIComponent(slug)}`,
    ).catch(() => null),
    searchTmdbMulti(item.title, 1, 'tv').catch(() => null),
  ]);

  const info = infoRes.results;
  let videos: MediaVideo[] | undefined = item.videos;
  let matchedTmdbId: number | undefined = item.tmdbId;

  const matchedShow = tmdbVideoMatch?.items[0];
  if (matchedShow) {
    matchedTmdbId = matchedShow.tmdbId ?? (typeof matchedShow.id === 'number' ? matchedShow.id : undefined);
    if (!videos?.length) {
      try {
        const tmdbDetail = await fetchTmdbDetail(matchedShow);
        videos = tmdbDetail.videos;
      } catch {
        // Optional trailer enrichment
      }
    }
  }

  const enrichedItem: MediaItem = info
    ? {
        ...item,
        tmdbId: matchedTmdbId,
        title: info.title || item.title,
        posterUrl: info.poster || item.posterUrl,
        backdropUrl: info.backgroundImage || info.poster || item.backdropUrl,
        description: info.synopsis?.trim() || item.description,
        rating: parseAnimeRating(info.malScore || info.rating || item.rating),
        year: parseAnimeYear(info.aired) || item.year,
        genres: info.genres && info.genres.length > 0 ? info.genres : item.genres,
        status: info.status ?? item.status,
        tagline: info.japaneseTitle ?? item.tagline,
        episodesCount: info.episodes ?? item.episodesCount,
        videos,
      }
    : { ...item, tmdbId: matchedTmdbId, videos };

  const episodes: MediaEpisode[] = (epRes?.results?.episodes || []).map((ep) => ({
    id: ep.id,
    episodeNumber: ep.episode_no,
    title: ep.title?.trim() || `Episode ${ep.episode_no}`,
    animeServerIds: ep.server_ids,
  }));

  return { item: enrichedItem, episodes };
}

export async function fetchTop10Trending(): Promise<MediaItem[]> {
  const trending = await fetchTrendingAll('day', 1);
  const top10 = trending.items.slice(0, 10);
  if (top10.length > 0) {
    try {
      const lead = await fetchTmdbDetail(top10[0]);
      top10[0] = lead;
    } catch {
      // Keep base item
    }
  }
  return top10;
}

export function getOfflineFallbackHome() {
  return {
    billboard: CATALOG_ITEMS.slice(0, 5),
    top10: CATALOG_ITEMS.slice(0, 10),
    upcomingTv: CATALOG_ITEMS.filter((i) => i.mediaType === 'tv').slice(0, 14),
    popularMovies: CATALOG_ITEMS.filter((i) => i.mediaType === 'movie').slice(0, 14),
    popularShows: CATALOG_ITEMS.filter((i) => i.mediaType === 'tv').slice(0, 14),
    topRatedMovies: CATALOG_ITEMS.filter((i) => i.mediaType === 'movie').slice(10, 24),
    topRatedShows: CATALOG_ITEMS.filter((i) => i.mediaType === 'tv').slice(10, 24),
    popularAnime: CATALOG_ITEMS.filter((i) => i.mediaType === 'anime'),
  };
}
