export type MediaType = 'movie' | 'tv' | 'anime';

export type NavTab = 'home' | 'movie' | 'tv' | 'anime' | 'watchlist';

export type StreamingProviderId =
  | 'netflix'
  | 'primevideo'
  | 'hbomax'
  | 'disney'
  | 'appletv'
  | 'paramount'
  | 'hulu';

export interface MediaVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface MediaCastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface MediaEpisode {
  id: string | number;
  episodeNumber: number;
  seasonNumber?: number;
  title: string;
  overview?: string;
  stillUrl?: string | null;
  stillUrlLarge?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  rating?: number | null;
  animeServerIds?: string;
}

export interface MediaItem {
  id: number | string;
  tmdbId?: number;
  imdbId?: string | null;
  animeSlug?: string;
  title: string;
  originalTitle?: string;
  mediaType: MediaType;
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string | null;
  description: string;
  rating: number;
  year: number;
  releaseDate: string;
  genreIds: number[];
  genres: string[];
  certification?: string | null;
  runtime?: number | null;
  seasons?: number | null;
  seasonNumbers?: number[];
  tag?: 'new_season' | 'recently_added' | 'new_episode_now' | null;
  episodeCode?: string | null;
  episodeAirDate?: string | null;
  streamUrl: string;
  tagline?: string | null;
  status?: string | null;
  cast?: MediaCastMember[];
  videos?: MediaVideo[];
  recommendations?: MediaItem[];
  episodesCount?: { sub?: number; dub?: number };
}

export interface GenreCardItem {
  id: string;
  genreId: number;
  label: string;
  accent: string;
  backdropUrl?: string;
}

export interface StreamingProviderMeta {
  id: StreamingProviderId;
  name: string;
  networkIds: string;
  iconUrl: string;
  accentColor: string;
  softBg: string;
  itemIds: number[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface StreamSourceOption {
  id: string;
  label: string;
  quality: string;
  kind: 'hls' | 'mp4' | 'embed';
  url: string;
  note?: string;
  serverName?: string;
  serverTag?: string;
  flagCode?: string;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  langCode: string;
  url: string;
  type?: 'srt' | 'vtt' | 'upload';
  flagUrl?: string;
  server?: 'opensubtitles' | 'stream' | 'upload';
}

export type DownloadStatus = 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface DownloadRecord {
  id: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string;
  episodeLabel?: string | null;
  quality: string;
  kind: 'video' | 'subtitle';
  filename: string;
  url: string;
  status: DownloadStatus;
  progress: number;
  statusText: string;
  bytesDownloaded: number;
  totalBytes?: number | null;
  savePath?: string | null;
  createdAt: number;
  completedAt?: number | null;
}
