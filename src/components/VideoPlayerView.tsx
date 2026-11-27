import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  ListVideo,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  SkipForward,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { useDownloadManager } from '@/src/context/DownloadContext';
import {
  fetchAnimeDetailAndEpisodes,
  fetchTmdbDetail,
  fetchTvSeasonEpisodes,
} from '@/src/services/api';
import {
  MOVY_SERVERS,
  convertRawSubtitleToVttBlobUrl,
  fetchAnimeEpisodeStream,
  fetchBackendMovieTvSources,
  fetchLiveSubtitles,
  filterEnglishSubtitles,
  findActiveCueText,
  flagSvgUrl,
  parseSubtitleCues,
  type ResolvedBackendServer,
  type SubtitleCue,
} from '@/src/services/streamResolver';
import type {
  MediaEpisode,
  MediaItem,
  StreamSourceOption,
  SubtitleTrack,
} from '@/src/types/media';

interface VideoPlayerViewProps {
  item: MediaItem;
  initialSeason?: number;
  initialEpisode?: MediaEpisode | null;
  initialAnimeAudio?: 'sub' | 'dub';
  inWatchlist: boolean;
  onToggleWatchlist: (item: MediaItem) => void;
  onOpenDownload: (context: {
    item: MediaItem;
    seasonNumber: number;
    episode: MediaEpisode | null;
    animeAudio: 'sub' | 'dub';
  }) => void;
  onClose: () => void;
}

interface SubtitleSettings {
  fontSize: number;
  backgroundOpacity: number;
  color: string;
}

interface HlsQualityOption {
  levelIndex: number; // -1 = Auto
  label: string;
  caption?: string;
  height: number;
}

interface HlsAudioOption {
  index: number;
  lang: string;
  name: string;
}

type ServerProbeStatus = 'idle' | 'loading' | 'success' | 'error';

const STORAGE_KEYS = {
  volume: 'movy_player_volume',
  muted: 'movy_player_muted',
  favoriteServer: 'movy_favorite_server',
  subtitleSettings: 'movy_subtitle_settings',
  subtitleOff: 'movy_subtitle_off',
};

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function getDefaultSubtitleSettings(isTouch: boolean): SubtitleSettings {
  const base = {
    fontSize: isTouch ? 23 : 30,
    backgroundOpacity: 0.45,
    color: '#fcf4f4',
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.subtitleSettings);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SubtitleSettings>;
      return {
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : base.fontSize,
        backgroundOpacity:
          typeof parsed.backgroundOpacity === 'number'
            ? parsed.backgroundOpacity
            : base.backgroundOpacity,
        color: typeof parsed.color === 'string' && parsed.color ? parsed.color : base.color,
      };
    }
  } catch {
    // Ignore
  }
  return base;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatRuntimeShort(minutes?: number | null): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return '';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function qualityCaption(q: string): string | undefined {
  const low = q.toLowerCase();
  if (low.includes('2160') || low.includes('4k')) return 'Ultra HD';
  if (low.includes('1080')) return 'Full HD';
  if (low.includes('720')) return 'HD';
  if (low === 'auto') return 'Adaptive';
  return undefined;
}

// Custom Movy SVG Icons
const MovyBackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    strokeWidth={2.5}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    color="currentColor"
    className={className}
  >
    <path
      d="M21 12L3 12M3 12L11.5 3.5M3 12L11.5 20.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MovyPlaySvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 384 512"
    fill="currentColor"
    className={className}
    style={{ transform: 'translateX(5%)' }}
  >
    <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z" />
  </svg>
);

const MovyPauseSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 320 512" fill="currentColor" className={className}>
    <path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z" />
  </svg>
);

const MovyBackward10Svg: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M13.6667 12.3333L9 7.66667M9 7.66667L13.6667 3M9 7.66667H18.3333C19.571 7.66667 20.758 8.15833 21.6332 9.0335C22.5083 9.90867 23 11.0957 23 12.3333C23 13.571 22.5083 14.758 21.6332 15.6332C20.758 16.5083 19.571 17 18.3333 17H16"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.50426 14.2727V23H2.65909V16.0241H2.60795L0.609375 17.277V15.6406L2.76989 14.2727H4.50426ZM10.0004 23.1918C9.2674 23.1889 8.63672 23.0085 8.10831 22.6506C7.58274 22.2926 7.17791 21.7741 6.89382 21.0952C6.61257 20.4162 6.47337 19.5994 6.47621 18.6449C6.47621 17.6932 6.61683 16.8821 6.89808 16.2116C7.18217 15.5412 7.587 15.0312 8.11257 14.6818C8.64098 14.3295 9.27024 14.1534 10.0004 14.1534C10.7305 14.1534 11.3583 14.3295 11.8839 14.6818C12.4123 15.0341 12.8185 15.5455 13.1026 16.2159C13.3867 16.8835 13.5273 17.6932 13.5245 18.6449C13.5245 19.6023 13.3825 20.4205 13.0984 21.0994C12.8171 21.7784 12.4137 22.2969 11.8881 22.6548C11.3626 23.0128 10.7333 23.1918 10.0004 23.1918ZM10.0004 21.6619C10.5004 21.6619 10.8995 21.4105 11.1978 20.9077C11.4961 20.4048 11.6438 19.6506 11.641 18.6449C11.641 17.983 11.5728 17.4318 11.4364 16.9915C11.3029 16.5511 11.1126 16.2202 10.8654 15.9986C10.6211 15.777 10.3327 15.6662 10.0004 15.6662C9.5032 15.6662 9.10547 15.9148 8.80717 16.4119C8.50888 16.9091 8.35831 17.6534 8.35547 18.6449C8.35547 19.3153 8.42223 19.875 8.55575 20.3239C8.69212 20.7699 8.88388 21.1051 9.13104 21.3295C9.3782 21.5511 9.66797 21.6619 10.0004 21.6619Z"
      fill="currentColor"
    />
  </svg>
);

const MovyForward10Svg: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 26 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M11.3333 12.3333L16 7.66667M16 7.66667L11.3333 3M16 7.66667H6.66667C5.42899 7.66667 4.242 8.15833 3.36684 9.0335C2.49167 9.90867 2 11.0957 2 12.3333C2 13.571 2.49167 14.758 3.36684 15.6332C4.242 16.5083 5.42899 17 6.66667 17H9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.5043 14.2727V23H14.6591V16.0241H14.608L12.6094 17.277V15.6406L14.7699 14.2727H16.5043ZM22.0004 23.1918C21.2674 23.1889 20.6367 23.0085 20.1083 22.6506C19.5827 22.2926 19.1779 21.7741 18.8938 21.0952C18.6126 20.4162 18.4734 19.5994 18.4762 18.6449C18.4762 17.6932 18.6168 16.8821 18.8981 16.2116C19.1822 15.5412 19.587 15.0312 20.1126 14.6818C20.641 14.3295 21.2702 14.1534 22.0004 14.1534C22.7305 14.1534 23.3583 14.3295 23.8839 14.6818C24.4123 15.0341 24.8185 15.5455 25.1026 16.2159C25.3867 16.8835 25.5273 17.6932 25.5245 18.6449C25.5245 19.6023 25.3825 20.4205 25.0984 21.0994C24.8171 21.7784 24.4137 22.2969 23.8881 22.6548C23.3626 23.0128 22.7333 23.1918 22.0004 23.1918ZM22.0004 21.6619C22.5004 21.6619 22.8995 21.4105 23.1978 20.9077C23.4961 20.4048 23.6438 19.6506 23.641 18.6449C23.641 17.983 23.5728 17.4318 23.4364 16.9915C23.3029 16.5511 23.1126 16.2202 22.8654 15.9986C22.6211 15.777 22.3327 15.6662 22.0004 15.6662C21.5032 15.6662 21.1055 15.9148 20.8072 16.4119C20.5089 16.9091 20.3583 17.6534 20.3555 18.6449C20.3555 19.3153 20.4222 19.875 20.5558 20.3239C20.6921 20.7699 20.8839 21.1051 21.131 21.3295C21.3782 21.5511 21.668 21.6619 22.0004 21.6619Z"
      fill="currentColor"
    />
  </svg>
);

const MovyQualitySvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    strokeWidth={1.5}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    color="currentColor"
  >
    <path
      d="M14 12L10.5 14V10L14 12Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 12.7075V11.2924C2 8.39705 2 6.94939 2.90549 6.01792C3.81099 5.08645 5.23656 5.04613 8.08769 4.96549C9.43873 4.92728 10.8188 4.8999 12 4.8999C13.1812 4.8999 14.5613 4.92728 15.9123 4.96549C18.7634 5.04613 20.189 5.08645 21.0945 6.01792C22 6.94939 22 8.39705 22 11.2924V12.7075C22 15.6028 22 17.0505 21.0945 17.9819C20.189 18.9134 18.7635 18.9537 15.9124 19.0344C14.5613 19.0726 13.1812 19.1 12 19.1C10.8188 19.1 9.43867 19.0726 8.0876 19.0344C5.23651 18.9537 3.81097 18.9134 2.90548 17.9819C2 17.0505 2 15.6028 2 12.7075Z"
      stroke="currentColor"
      strokeWidth={1.5}
    />
  </svg>
);

const MovyCcSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    color="currentColor"
  >
    <path
      d="M1 15V9C1 5.68629 3.68629 3 7 3H17C20.3137 3 23 5.68629 23 9V15C23 18.3137 20.3137 21 17 21H7C3.68629 21 1 18.3137 1 15Z"
      stroke="currentColor"
      strokeWidth={1.5}
    />
    <path
      d="M10.5 10L10.3284 9.82843C9.79799 9.29799 9.07857 9 8.32843 9C6.76633 9 5.5 10.2663 5.5 11.8284V12.1716C5.5 13.7337 6.76633 15 8.32843 15C9.07857 15 9.79799 14.702 10.3284 14.1716L10.5 14"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <path
      d="M18.5 10L18.3284 9.82843C17.798 9.29799 17.0786 9 16.3284 9C14.7663 9 13.5 10.2663 13.5 11.8284V12.1716C13.5 13.7337 14.7663 15 16.3284 15C17.0786 15 17.798 14.702 18.3284 14.1716L18.5 14"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
);

const MovyVolumeSvg: React.FC<{ level: number; muted: boolean; className?: string }> = ({
  level,
  muted,
  className,
}) => {
  if (muted || level <= 0) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
        <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" />
        <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      {level > 10 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />}
      {level > 55 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" strokeLinecap="round" />}
    </svg>
  );
};

const MovyLoaderRing: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="25 25 50 50" className={`vp-loader-ring ${className || ''}`}>
    <circle cx="50" cy="50" r="20" />
  </svg>
);

const TOP_BAR_BTN_CLASS =
  'tabbable flex items-center gap-2 p-2 md:px-3 md:py-2 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-all text-sm font-semibold whitespace-nowrap shrink-0';

const PILL_GROUP_CLASS =
  'flex items-center bg-white/[0.08] border border-white/15 backdrop-blur-md rounded-2xl shadow-2xl';

const PILL_ICON_BTN_CLASS =
  'tabbable flex items-center gap-1.5 p-1.5 md:p-2 rounded-xl border border-transparent text-white/90 hover:text-white hover:bg-white/10 transition-all text-xs md:text-sm font-semibold whitespace-nowrap shrink-0 active:scale-95';

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  item,
  initialSeason = 1,
  initialEpisode = null,
  initialAnimeAudio = 'sub',
  inWatchlist,
  onToggleWatchlist,
  onOpenDownload,
  onClose,
}) => {
  const { activeDownloads, overallProgress } = useDownloadManager();

  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const menuHoverTimerRef = useRef<number | null>(null);
  const qualityPopoverRef = useRef<HTMLDivElement>(null);
  const subsPopoverRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' | 'center' } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const lastSeekDirRef = useRef<'back' | 'forward' | null>(null);
  const lastSeekAtRef = useRef<number>(0);
  const seekAccumRef = useRef<number>(0);
  const osdTimerRef = useRef<number | null>(null);
  const centerPulseTimerRef = useRef<number | null>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
      : false,
  );
  const [isIOS] = useState(() =>
    typeof navigator !== 'undefined'
      ? /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      : false,
  );

  // Content & episode state
  const [detailItem, setDetailItem] = useState<MediaItem>(item);
  const [seasonNumber, setSeasonNumber] = useState(
    initialEpisode?.seasonNumber ?? initialSeason,
  );
  const [episodes, setEpisodes] = useState<MediaEpisode[]>(
    initialEpisode ? [initialEpisode] : [],
  );
  const [currentEpisode, setCurrentEpisode] = useState<MediaEpisode | null>(initialEpisode);
  const [animeAudio, setAnimeAudio] = useState<'sub' | 'dub'>(initialAnimeAudio);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  // Stream & server state
  const [favoriteServer, setFavoriteServer] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.favoriteServer) || 'miami';
    } catch {
      return 'miami';
    }
  });
  const [activeServerId, setActiveServerId] = useState<string>(favoriteServer);
  const [resolvedServers, setResolvedServers] = useState<ResolvedBackendServer[]>([]);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerProbeStatus>>({});
  const [sources, setSources] = useState<StreamSourceOption[]>([]);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [streamResolving, setStreamResolving] = useState(true);
  const [streamFailedAll, setStreamFailedAll] = useState(false);
  const [streamErrorReason, setStreamErrorReason] = useState<string | null>(null);
  const [probeRetryNonce, setProbeRetryNonce] = useState(0);

  // HLS levels & audio tracks
  const [hlsQualities, setHlsQualities] = useState<HlsQualityOption[]>([]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);
  const [hlsAudios, setHlsAudios] = useState<HlsAudioOption[]>([]);
  const [selectedHlsAudio, setSelectedHlsAudio] = useState<number>(0);

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [searchSubsList, setSearchSubsList] = useState<SubtitleTrack[]>([]);
  const [searchSubsLoading, setSearchSubsLoading] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubtitleTrack | null>(null);
  const [isSubOff, setIsSubOff] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.subtitleOff) === 'true';
    } catch {
      return false;
    }
  });
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [activeCueHtml, setActiveCueHtml] = useState('');
  const [iosVttUrl, setIosVttUrl] = useState('');
  const [subLatency, setSubLatency] = useState(0);
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() =>
    getDefaultSubtitleSettings(isTouchDevice),
  );

  // UI overlays & playback state
  const [openMenu, setOpenMenu] = useState<'quality' | 'subs' | null>(null);
  const [subsView, setSubsView] = useState<'main' | 'opensubs' | 'customize'>('main');
  const [episodesDrawerOpen, setEpisodesDrawerOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPointerOverUI, setIsPointerOverUI] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRatingBadge, setShowRatingBadge] = useState(true);

  // Video element state
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [loadedData, setLoadedData] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEYS.volume));
      return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 100;
    } catch {
      return 100;
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.muted) === '1';
    } catch {
      return false;
    }
  });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState<{ time: number; offsetPx: number } | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{
    side: 'back' | 'forward';
    seconds: number;
    key: number;
  } | null>(null);
  const [mobileBoostLevel, setMobileBoostLevel] = useState<0 | 1 | 2>(0);
  const [osdBadge, setOsdBadge] = useState<{
    show: boolean;
    kind: 'volume' | 'subs';
    text: string;
    color: string;
    volumeLevel?: number;
    muted?: boolean;
  }>({ show: false, kind: 'volume', text: '100%', color: '#ffffff' });
  const [centerPulse, setCenterPulse] = useState<'play' | 'pause' | null>(null);

  const activeSource = sources[selectedSourceIdx] ?? null;

  // Watch progress storage key
  const progressStorageKey = useMemo(() => {
    const id = detailItem.tmdbId ?? detailItem.id;
    if (detailItem.mediaType === 'movie') return `movy_progress_movie_${id}`;
    return `movy_progress_${detailItem.mediaType}_${id}_s${
      currentEpisode?.seasonNumber ?? seasonNumber
    }_e${currentEpisode?.episodeNumber ?? 1}`;
  }, [detailItem.id, detailItem.mediaType, detailItem.tmdbId, currentEpisode, seasonNumber]);

  // Responsive pointer detection
  useEffect(() => {
    const update = () => {
      setIsTouchDevice(
        window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768,
      );
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Lock document scroll while player is mounted
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  // Rating opening badge 6s display
  useEffect(() => {
    setShowRatingBadge(true);
    const t = window.setTimeout(() => setShowRatingBadge(false), 6500);
    return () => window.clearTimeout(t);
  }, [item.id, currentEpisode?.id]);

  // Auto-hide HUD logic (Movy 5s timer when playing and no popups open)
  const keepHudVisible =
    paused || buffering || openMenu !== null || episodesDrawerOpen || isSeeking || isPointerOverUI;

  const scheduleHudHide = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (keepHudVisible) {
      setControlsVisible(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, 5000);
  }, [keepHudVisible]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHudHide();
  }, [scheduleHudHide]);

  useEffect(() => {
    scheduleHudHide();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHudHide]);

  // Close popovers on outside click
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        openMenu === 'quality' &&
        qualityPopoverRef.current &&
        !qualityPopoverRef.current.contains(target)
      ) {
        setOpenMenu(null);
      }
      if (
        openMenu === 'subs' &&
        subsPopoverRef.current &&
        !subsPopoverRef.current.contains(target)
      ) {
        setOpenMenu(null);
        setSubsView('main');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openMenu]);

  // Hydrate full item details (imdbId, seasons, runtime) & episode lists
  useEffect(() => {
    let cancelled = false;
    setDetailItem(item);

    if (item.mediaType === 'anime') {
      setEpisodesLoading(true);
      fetchAnimeDetailAndEpisodes(item)
        .then(({ item: enriched, episodes: eps }) => {
          if (cancelled) return;
          setDetailItem(enriched);
          if (eps.length > 0) {
            setEpisodes(eps);
            setCurrentEpisode((prev) => {
              if (prev) return eps.find((e) => e.episodeNumber === prev.episodeNumber) ?? eps[0];
              return eps[0];
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setEpisodesLoading(false);
        });
    } else {
      fetchTmdbDetail(item)
        .then((full) => {
          if (!cancelled) setDetailItem(full);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    if (item.mediaType !== 'tv') return;
    let cancelled = false;
    setEpisodesLoading(true);
    const tmdbId = item.tmdbId ?? item.id;
    fetchTvSeasonEpisodes(tmdbId, seasonNumber)
      .then((eps) => {
        if (cancelled) return;
        setEpisodes(eps);
        if (eps.length > 0) {
          setCurrentEpisode((prev) => {
            if (prev && prev.seasonNumber === seasonNumber) {
              return eps.find((e) => e.episodeNumber === prev.episodeNumber) ?? eps[0];
            }
            return eps[0];
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, seasonNumber]);

  // Resolve native direct streams from Movy servers (Movie/TV) or Anikoto/anime.vidy.st (Anime)
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const epNum = currentEpisode?.episodeNumber ?? 1;
    const secNum = currentEpisode?.seasonNumber ?? seasonNumber;

    // Wait briefly if Anime hasn't hydrated episode list yet
    if (detailItem.mediaType === 'anime' && !currentEpisode && episodesLoading) {
      return () => controller.abort();
    }

    setStreamResolving(true);
    setStreamFailedAll(false);
    setStreamErrorReason(null);
    setResolvedServers([]);
    setSources([]);
    setSelectedSourceIdx(0);
    setHlsQualities([]);
    setSelectedHlsLevel(-1);
    setHlsAudios([]);
    setBuffering(true);
    setLoadedData(false);
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
    setServerStatuses({});

    (async () => {
      try {
        const resolvedItem =
          item.mediaType !== 'anime' && !item.imdbId
            ? await fetchTmdbDetail(item).catch(() => item)
            : item;

        if (cancelled) return;
        if (resolvedItem !== item) setDetailItem(resolvedItem);

        if (resolvedItem.mediaType === 'anime') {
          const [animeRes, liveSubs] = await Promise.all([
            currentEpisode
              ? fetchAnimeEpisodeStream(currentEpisode, animeAudio, controller.signal)
              : Promise.resolve({ sources: [], subtitles: [] }),
            resolvedItem.imdbId || resolvedItem.tmdbId
              ? fetchLiveSubtitles(
                  resolvedItem.imdbId || resolvedItem.tmdbId,
                  'tv',
                  secNum,
                  epNum,
                  controller.signal,
                )
              : Promise.resolve([]),
          ]);

          let finalSources = animeRes.sources;
          let finalSubs = animeRes.subtitles;
          let fallbackError: string | null = null;

          if (finalSources.length === 0 && resolvedItem.tmdbId) {
            const tvFallback = await fetchBackendMovieTvSources(
              { ...resolvedItem, mediaType: 'tv' },
              secNum,
              epNum,
              favoriteServer,
              controller.signal,
            ).catch((err) => ({
              servers: [] as ResolvedBackendServer[],
              sources: [] as StreamSourceOption[],
              subtitles: [] as SubtitleTrack[],
              activeServerId: null,
              errorReason: (err as Error)?.message || 'Failed to connect',
            }));
            finalSources = tvFallback.sources;
            if (!cancelled && tvFallback.servers.length > 0) {
              setResolvedServers(tvFallback.servers);
            }
            if (finalSubs.length === 0) finalSubs = tvFallback.subtitles;
            if (tvFallback.activeServerId) setActiveServerId(tvFallback.activeServerId);
            if (tvFallback.errorReason) fallbackError = tvFallback.errorReason;
          }

          if (cancelled) return;
          const mergedSubs = filterEnglishSubtitles(finalSubs.length > 0 ? finalSubs : liveSubs);
          setSubtitles(mergedSubs);
          setSearchSubsList(filterEnglishSubtitles(liveSubs));
          setSources(finalSources);
          if (finalSources.length > 0 && finalSources[0].serverTag) {
            setActiveServerId(finalSources[0].serverTag);
          }
          setStreamFailedAll(finalSources.length === 0);
          setStreamErrorReason(finalSources.length === 0 ? fallbackError : null);

          if (!isSubOff && mergedSubs.length > 0) {
            setSelectedSub(mergedSubs[0]);
          }
        } else {
          const lookupId = resolvedItem.imdbId || resolvedItem.tmdbId || resolvedItem.id;
          const [directRes, liveSubs] = await Promise.all([
            fetchBackendMovieTvSources(
              resolvedItem,
              secNum,
              epNum,
              favoriteServer,
              controller.signal,
            ),
            fetchLiveSubtitles(lookupId, resolvedItem.mediaType, secNum, epNum, controller.signal),
          ]);

          if (cancelled) return;
          const statusMap: Record<string, ServerProbeStatus> = {};
          for (const srv of directRes.servers) {
            statusMap[srv.id] = 'success';
          }
          setServerStatuses(statusMap);
          setResolvedServers(directRes.servers);

          const mergedSubs = filterEnglishSubtitles(
            directRes.subtitles.length > 0 ? directRes.subtitles : liveSubs,
          );
          setSubtitles(mergedSubs);
          setSearchSubsList(filterEnglishSubtitles(liveSubs));
          setSources(directRes.sources);
          if (directRes.activeServerId) setActiveServerId(directRes.activeServerId);
          setStreamFailedAll(directRes.sources.length === 0);
          setStreamErrorReason(
            directRes.sources.length === 0 ? directRes.errorReason ?? null : null,
          );

          if (!isSubOff && mergedSubs.length > 0) {
            setSelectedSub(mergedSubs[0]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStreamFailedAll(true);
          setStreamErrorReason((err as Error)?.message || null);
        }
      } finally {
        if (!cancelled) {
          setStreamResolving(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    item,
    seasonNumber,
    currentEpisode?.id,
    currentEpisode?.episodeNumber,
    animeAudio,
    episodesLoading,
    probeRetryNonce,
  ]);

  // Manual server switch inside Movy's Server Menu
  const switchToMovyServer = useCallback(
    async (serverId: string) => {
      const existing = resolvedServers.find(
        (s) => s.id === serverId || s.tag === serverId,
      );
      if (existing && existing.sources.length > 0) {
        setActiveServerId(existing.id);
        setSources(existing.sources);
        setSelectedSourceIdx(0);
        setStreamFailedAll(false);
        setBuffering(true);
        setServerStatuses((prev) => ({ ...prev, [existing.id]: 'success' }));
        return;
      }

      const epNum = currentEpisode?.episodeNumber ?? 1;
      const secNum = currentEpisode?.seasonNumber ?? seasonNumber;
      setActiveServerId(serverId);
      setServerStatuses((prev) => ({ ...prev, [serverId]: 'loading' }));
      setBuffering(true);
      setStreamFailedAll(false);

      try {
        const res = await fetchBackendMovieTvSources(
          detailItem,
          secNum,
          epNum,
          serverId,
        );
        if (res.sources.length > 0) {
          const statusMap: Record<string, ServerProbeStatus> = {};
          for (const srv of res.servers) statusMap[srv.id] = 'success';
          setServerStatuses(statusMap);
          setResolvedServers(res.servers);
          setSources(res.sources);
          setSelectedSourceIdx(0);
          if (res.activeServerId) setActiveServerId(res.activeServerId);
        } else {
          setServerStatuses((prev) => ({ ...prev, [serverId]: 'error' }));
          if (sources.length === 0) setStreamFailedAll(true);
          setBuffering(false);
        }
      } catch {
        setServerStatuses((prev) => ({ ...prev, [serverId]: 'error' }));
        if (sources.length === 0) setStreamFailedAll(true);
        setBuffering(false);
      }
    },
    [currentEpisode, detailItem, resolvedServers, seasonNumber, sources.length],
  );

  const toggleFavoriteServer = useCallback((e: React.MouseEvent | React.KeyboardEvent, tag: string) => {
    e.stopPropagation();
    setFavoriteServer((prev) => {
      const next = prev === tag ? '' : tag;
      try {
        localStorage.setItem(STORAGE_KEYS.favoriteServer, next);
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Load OpenSubtitles search inside Audio & Subtitles popover if empty
  const openSubtitleSearchView = useCallback(async () => {
    setSubsView('opensubs');
    if (searchSubsList.length > 0) return;
    setSearchSubsLoading(true);
    try {
      const epNum = currentEpisode?.episodeNumber ?? 1;
      const secNum = currentEpisode?.seasonNumber ?? seasonNumber;
      const lookupId = detailItem.imdbId || detailItem.tmdbId || detailItem.id;
      const list = await fetchLiveSubtitles(lookupId, detailItem.mediaType, secNum, epNum);
      setSearchSubsList(list);
    } finally {
      setSearchSubsLoading(false);
    }
  }, [currentEpisode, detailItem, searchSubsList.length, seasonNumber]);

  // Attach active HLS or MP4 stream to <video>
  useEffect(() => {
    const videoEl = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setHlsQualities([]);
    setHlsAudios([]);
    setSelectedHlsLevel(-1);

    if (!videoEl || !activeSource) return;

    let destroyed = false;

    const tryAutoPlay = () => {
      videoEl.play().catch(() => {
        // Fallback if unmuted autoplay is blocked by browser policy
        videoEl.muted = true;
        setIsMuted(true);
        videoEl.play().catch(() => {
          setPaused(true);
          setBuffering(false);
        });
      });
    };

    const advanceOnFatal = () => {
      if (selectedSourceIdx + 1 < sources.length) {
        setSelectedSourceIdx((prev) => prev + 1);
      } else {
        if (activeSource.serverTag) {
          setServerStatuses((prev) => ({ ...prev, [activeSource.serverTag!]: 'error' }));
        }
        setBuffering(false);
        setStreamFailedAll(true);
      }
    };

    if (activeSource.kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          renderTextTracksNatively: false,
        });
        hlsRef.current = hls;
        hls.attachMedia(videoEl);
        hls.loadSource(activeSource.url);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (destroyed) return;
          if (hls.levels?.length) {
            const levels: HlsQualityOption[] = hls.levels
              .map((lvl, idx) => ({
                levelIndex: idx,
                height: lvl.height || 0,
                label: lvl.height ? `${lvl.height}p` : `Track ${idx + 1}`,
                caption: qualityCaption(lvl.height ? `${lvl.height}p` : ''),
              }))
              .filter((l) => l.height > 0)
              .sort((a, b) => b.height - a.height);

            if (levels.length > 0) {
              setHlsQualities([
                { levelIndex: -1, height: 9999, label: 'Auto', caption: 'Adaptive' },
                ...levels,
              ]);
            }
          }
          tryAutoPlay();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_ev, data) => {
          if (destroyed || hls.autoLevelEnabled) return;
          setSelectedHlsLevel(data.level);
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_ev, data) => {
          if (destroyed) return;
          const mapped: HlsAudioOption[] = (data.audioTracks || []).map((t, idx) => ({
            index: idx,
            lang: t.lang || `aud-${idx}`,
            name: t.name || t.lang || `Audio ${idx + 1}`,
          }));
          setHlsAudios(mapped);
          setSelectedHlsAudio(hls.audioTrack >= 0 ? hls.audioTrack : 0);
        });

        let recoverAttempts = 0;
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (destroyed || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoverAttempts < 1) {
            recoverAttempts += 1;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoverAttempts < 2) {
            recoverAttempts += 1;
            hls.recoverMediaError();
          } else {
            hls.destroy();
            hlsRef.current = null;
            advanceOnFatal();
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = activeSource.url;
        tryAutoPlay();
      } else {
        advanceOnFatal();
      }
    } else {
      videoEl.src = activeSource.url;
      tryAutoPlay();
    }

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSource, selectedSourceIdx, sources.length]);

  const triggerVolumeOsd = useCallback(
    (levelPct: number, mutedState: boolean, customText?: string, customColor?: string) => {
      const color =
        customColor ??
        (levelPct > 125 ? '#ef4444' : levelPct > 100 ? '#f97316' : '#ffffff');
      const text = customText ?? (mutedState || levelPct === 0 ? 'Muted' : `${levelPct}%`);
      setOsdBadge({
        show: true,
        kind: 'volume',
        text,
        color,
        volumeLevel: levelPct,
        muted: mutedState,
      });
      if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = window.setTimeout(() => {
        setOsdBadge((prev) => ({ ...prev, show: false }));
      }, 1100);
    },
    [],
  );

  const triggerSubsOsd = useCallback((text: string) => {
    setOsdBadge({
      show: true,
      kind: 'subs',
      text,
      color: '#ffffff',
    });
    if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current);
    osdTimerRef.current = window.setTimeout(() => {
      setOsdBadge((prev) => ({ ...prev, show: false }));
    }, 1100);
  }, []);

  const ensureGainNode = useCallback(() => {
    const v = videoRef.current;
    if (!v) return null;
    if (gainNodeRef.current) {
      if (audioCtxRef.current?.state === 'suspended') {
        void audioCtxRef.current.resume().catch(() => {});
      }
      return gainNodeRef.current;
    }
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaElementSource(v);
      const gainNode = ctx.createGain();
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      return gainNode;
    } catch {
      return null;
    }
  }, []);

  const toggleMobileVolumeBoost = useCallback(() => {
    const nextLevel: 0 | 1 | 2 = mobileBoostLevel === 0 ? 1 : mobileBoostLevel === 1 ? 2 : 0;
    const gainValue = nextLevel === 1 ? 1.25 : nextLevel === 2 ? 1.5 : 1.0;

    if (nextLevel > 0) {
      setIsMuted(false);
      setVolume(100);
      const gain = ensureGainNode();
      if (gain) gain.gain.value = gainValue;
    } else if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 1.0;
    }

    setMobileBoostLevel(nextLevel);
    if (nextLevel === 1) {
      triggerVolumeOsd(125, false, '+25%', '#f97316');
    } else if (nextLevel === 2) {
      triggerVolumeOsd(150, false, '+50%', '#ef4444');
    } else {
      triggerVolumeOsd(100, false, 'Boost Off', '#ffffff');
    }
  }, [ensureGainNode, mobileBoostLevel, triggerVolumeOsd]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
        gainNodeRef.current = null;
      }
      if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current);
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
      if (centerPulseTimerRef.current) window.clearTimeout(centerPulseTimerRef.current);
    };
  }, []);

  // Sync volume, mute, mobile boost gain, playbackRate with video element & localStorage
  useEffect(() => {
    const v = videoRef.current;
    const boostGain =
      isTouchDevice && mobileBoostLevel === 1
        ? 1.25
        : isTouchDevice && mobileBoostLevel === 2
          ? 1.5
          : 1.0;

    if (v) {
      v.muted = isMuted;
      v.volume = isMuted ? 0 : volume / 100;
      v.playbackRate = playbackSpeed;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : boostGain;
    }
    try {
      localStorage.setItem(STORAGE_KEYS.volume, String(volume));
      localStorage.setItem(STORAGE_KEYS.muted, isMuted ? '1' : '0');
    } catch {
      // Ignore
    }
  }, [volume, isMuted, playbackSpeed, isTouchDevice, mobileBoostLevel]);

  // Sync subtitle settings to localStorage
  const updateSubtitleSettings = useCallback((patch: Partial<SubtitleSettings>) => {
    setSubtitleSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEYS.subtitleSettings, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Fetch & parse selected subtitle for Movy's custom .vp-cue overlay + iOS fullscreen track
  useEffect(() => {
    let cancelled = false;
    setSubtitleCues([]);
    setActiveCueHtml('');
    setIosVttUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });

    if (!selectedSub || !selectedSub.url || isSubOff) return;

    fetch(selectedSub.url)
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (cancelled || !text) return;
        const parsed = parseSubtitleCues(text);
        setSubtitleCues(parsed);
        if (isIOS) {
          setIosVttUrl(convertRawSubtitleToVttBlobUrl(text));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedSub, isSubOff, isIOS]);

  // Compute active cue HTML from currentTime & latency
  useEffect(() => {
    if (subtitleCues.length === 0 || isSubOff) {
      setActiveCueHtml('');
      return;
    }
    const timeMs = currentTime * 1000 - subLatency * 1000;
    setActiveCueHtml(findActiveCueText(subtitleCues, timeMs));
  }, [currentTime, subLatency, subtitleCues, isSubOff]);

  // Handle custom .srt / .vtt upload
  const handleUploadSubtitle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSrt = file.name.toLowerCase().endsWith('.srt');
    const isVtt = file.name.toLowerCase().endsWith('.vtt');
    if (!isSrt && !isVtt) return;

    const url = URL.createObjectURL(file);
    const track: SubtitleTrack = {
      id: `upload-${Date.now()}`,
      language: file.name,
      langCode: 'up',
      url,
      type: 'upload',
      server: 'upload',
    };
    setSelectedSub(track);
    setIsSubOff(false);
    try {
      localStorage.setItem(STORAGE_KEYS.subtitleOff, 'false');
    } catch {
      // Ignore
    }
  }, []);

  const selectSubtitle = useCallback((track: SubtitleTrack | null) => {
    if (!track) {
      setIsSubOff(true);
      setSelectedSub(null);
      try {
        localStorage.setItem(STORAGE_KEYS.subtitleOff, 'true');
      } catch {
        // Ignore
      }
      return;
    }
    setIsSubOff(false);
    setSelectedSub(track);
    try {
      localStorage.setItem(STORAGE_KEYS.subtitleOff, 'false');
    } catch {
      // Ignore
    }
  }, []);

  // Playback controls
  const togglePlayPause = useCallback(
    (withPulse = false) => {
      const v = videoRef.current;
      if (!v) return;
      if (audioCtxRef.current?.state === 'suspended') {
        void audioCtxRef.current.resume().catch(() => {});
      }
      if (v.paused) {
        v.play().catch(() => {});
        if (withPulse) {
          setCenterPulse('play');
          if (centerPulseTimerRef.current) window.clearTimeout(centerPulseTimerRef.current);
          centerPulseTimerRef.current = window.setTimeout(() => setCenterPulse(null), 350);
        }
      } else {
        v.pause();
        if (withPulse) {
          setCenterPulse('pause');
          if (centerPulseTimerRef.current) window.clearTimeout(centerPulseTimerRef.current);
          centerPulseTimerRef.current = window.setTimeout(() => setCenterPulse(null), 350);
        }
      }
      showControls();
    },
    [showControls],
  );

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      const next = Math.max(0, Math.min(v.duration, v.currentTime + deltaSeconds));
      v.currentTime = next;
      setCurrentTime(next);

      const side: 'back' | 'forward' = deltaSeconds < 0 ? 'back' : 'forward';
      const now = Date.now();
      if (lastSeekDirRef.current === side && now - lastSeekAtRef.current < 750) {
        seekAccumRef.current += Math.abs(deltaSeconds);
      } else {
        seekAccumRef.current = Math.abs(deltaSeconds);
      }
      lastSeekDirRef.current = side;
      lastSeekAtRef.current = now;

      setSeekFeedback({ side, seconds: seekAccumRef.current, key: now });
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
      seekFeedbackTimerRef.current = window.setTimeout(() => {
        setSeekFeedback(null);
        lastSeekDirRef.current = null;
        seekAccumRef.current = 0;
      }, 650);
      showControls();
    },
    [showControls],
  );

  // Fullscreen management (Desktop + Android Landscape Lock + iOS webkitEnterFullscreen)
  const exitFullscreenMode = useCallback(async () => {
    setIsFullscreen(false);
    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
        webkitFullscreenElement?: Element | null;
      };
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore
    }
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      // Ignore
    }
    showControls();
  }, [showControls]);

  const enterFullscreenMode = useCallback(async () => {
    const el = shellRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
          mozRequestFullScreen?: () => Promise<void> | void;
        })
      | null;
    const vid = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;

    setIsFullscreen(true);
    setOpenMenu(null);
    setEpisodesDrawerOpen(false);

    let nativeEntered = false;
    if (el) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
          nativeEntered = true;
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
          nativeEntered = true;
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen();
          nativeEntered = true;
        }
      } catch {
        // Fallback below
      }
    }

    if (!nativeEntered && vid?.webkitEnterFullscreen) {
      try {
        vid.webkitEnterFullscreen();
      } catch {
        // Ignore
      }
    }

    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      if (orientation?.lock && window.matchMedia('(pointer: coarse)').matches) {
        await orientation.lock('landscape');
      }
    } catch {
      // Optional
    }

    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreenMode();
    } else {
      await enterFullscreenMode();
    }
  }, [isFullscreen, exitFullscreenMode, enterFullscreenMode]);

  // Keyboard shortcuts (Space/K play-pause, F fullscreen, M mute, Left/Right ±10s, Up/Down ±5% volume)
  useEffect(() => {
    const onFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;
      if (fsEl) {
        setIsFullscreen(true);
      } else {
        setIsFullscreen(false);
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        } catch {
          // Ignore
        }
      }
    };

    const vid = videoRef.current;
    const onWebkitBegin = () => setIsFullscreen(true);
    const onWebkitEnd = () => setIsFullscreen(false);
    vid?.addEventListener('webkitbeginfullscreen', onWebkitBegin);
    vid?.addEventListener('webkitendfullscreen', onWebkitEnd);

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'Escape') {
        if (openMenu) setOpenMenu(null);
        else if (episodesDrawerOpen) setEpisodesDrawerOpen(false);
        else if (isFullscreen) void exitFullscreenMode();
        else onClose();
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K' || e.code === 'KeyK') {
        e.preventDefault();
        togglePlayPause(true);
      } else if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted((prevMuted) => {
          const nextMuted = !prevMuted;
          triggerVolumeOsd(nextMuted ? 0 : volume, nextMuted);
          return nextMuted;
        });
        showControls();
      } else if (e.key === 'c' || e.key === 'C' || e.code === 'KeyC') {
        e.preventDefault();
        if (subtitles.length === 0 && !selectedSub) {
          triggerSubsOsd('Subtitles Unavailable');
          showControls();
          return;
        }
        if (isSubOff) {
          const target = selectedSub || subtitles[0] || null;
          if (target) {
            selectSubtitle(target);
            triggerSubsOsd('Subtitles On');
          } else {
            triggerSubsOsd('Subtitles Unavailable');
          }
        } else {
          selectSubtitle(null);
          triggerSubsOsd('Subtitles Off');
        }
        showControls();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsMuted(false);
        setVolume((v) => {
          const next = Math.min(100, v + 5);
          triggerVolumeOsd(next, false);
          return next;
        });
        showControls();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.max(0, v - 5);
          if (next === 0) setIsMuted(true);
          triggerVolumeOsd(next, next === 0);
          return next;
        });
        showControls();
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
      vid?.removeEventListener('webkitbeginfullscreen', onWebkitBegin);
      vid?.removeEventListener('webkitendfullscreen', onWebkitEnd);
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      } catch {
        // Ignore
      }
    };
  }, [
    episodesDrawerOpen,
    exitFullscreenMode,
    isFullscreen,
    isSubOff,
    onClose,
    openMenu,
    seekBy,
    selectSubtitle,
    selectedSub,
    showControls,
    subtitles,
    toggleFullscreen,
    togglePlayPause,
    triggerSubsOsd,
    triggerVolumeOsd,
    volume,
  ]);

  // Interactive SeekBar drag & hover preview
  const computeTimeAtClientX = useCallback(
    (clientX: number): { time: number; offsetPx: number } | null => {
      const bar = seekBarRef.current;
      const vid = videoRef.current;
      if (!bar || !vid || !Number.isFinite(vid.duration) || vid.duration <= 0) return null;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      return {
        time: ratio * vid.duration,
        offsetPx: ratio * rect.width,
      };
    },
    [],
  );

  const startSeekDrag = useCallback(
    (initialClientX: number) => {
      setIsSeeking(true);
      let latestTime: number | null = null;
      const apply = (clientX: number) => {
        const res = computeTimeAtClientX(clientX);
        if (res) {
          latestTime = res.time;
          setCurrentTime(res.time);
          setSeekPreview({ time: Math.round(res.time), offsetPx: res.offsetPx });
        }
        showControls();
      };

      apply(initialClientX);

      const onMouseMove = (ev: MouseEvent) => apply(ev.clientX);
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches[0]) apply(ev.touches[0].clientX);
      };
      const finish = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('mouseup', finish);
        window.removeEventListener('touchend', finish);
        if (latestTime !== null && videoRef.current) {
          videoRef.current.currentTime = latestTime;
        }
        setIsSeeking(false);
        setSeekPreview(null);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('mouseup', finish, { once: true });
      window.addEventListener('touchend', finish, { once: true });
    },
    [computeTimeAtClientX, showControls],
  );

  const handleVideoSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const side: 'left' | 'right' | 'center' =
      relX < 0.32 ? 'left' : relX > 0.68 ? 'right' : 'center';

    if (isTouchDevice) {
      const now = Date.now();
      const prev = lastTapRef.current;
      if (prev && now - prev.time < 280 && prev.side === side && side !== 'center') {
        seekBy(side === 'left' ? -10 : 10);
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { time: now, side };
      setControlsVisible((v) => {
        const next = !v;
        if (next) scheduleHudHide();
        return next;
      });
    } else {
      if (e.detail === 2) {
        void toggleFullscreen();
      } else {
        togglePlayPause();
      }
    }
  };

  // Next Episode + Subtitle metadata
  const nextEpisode = useMemo(() => {
    if (!currentEpisode || episodes.length === 0) return null;
    const idx = episodes.findIndex((e) => e.episodeNumber === currentEpisode.episodeNumber);
    if (idx >= 0 && idx + 1 < episodes.length) return episodes[idx + 1];
    return null;
  }, [currentEpisode, episodes]);

  const seasonOptions = useMemo(() => {
    if (detailItem.seasonNumbers && detailItem.seasonNumbers.length > 0) {
      return detailItem.seasonNumbers;
    }
    const count = detailItem.seasons || 1;
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [detailItem]);

  const subtitleParts: string[] = [];
  if (item.mediaType === 'tv' && currentEpisode) {
    subtitleParts.push(
      `S${currentEpisode.seasonNumber ?? seasonNumber} · E${currentEpisode.episodeNumber}`,
    );
    if (currentEpisode.title) subtitleParts.push(currentEpisode.title);
  } else if (item.mediaType === 'anime' && currentEpisode) {
    subtitleParts.push(`Episode ${currentEpisode.episodeNumber}`);
    if (currentEpisode.title) subtitleParts.push(currentEpisode.title);
  }
  const durMin = duration > 0 ? duration / 60 : detailItem.runtime;
  const runtimeLabel = formatRuntimeShort(durMin);
  if (runtimeLabel) subtitleParts.push(runtimeLabel);
  const headerSubtitle = subtitleParts.join(' · ');

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  const activeQualityText = useMemo(() => {
    if (hlsQualities.length > 0) {
      const found = hlsQualities.find((q) => q.levelIndex === selectedHlsLevel);
      return found?.label || 'Auto';
    }
    return activeSource?.quality || '';
  }, [activeSource?.quality, hlsQualities, selectedHlsLevel]);

  const hoverMenuOpen = (menu: 'quality' | 'subs') => {
    if (menuHoverTimerRef.current) {
      window.clearTimeout(menuHoverTimerRef.current);
      menuHoverTimerRef.current = null;
    }
    setOpenMenu(menu);
  };

  const hoverMenuLeave = () => {
    if (menuHoverTimerRef.current) window.clearTimeout(menuHoverTimerRef.current);
    menuHoverTimerRef.current = window.setTimeout(() => {
      setOpenMenu((prev) => (prev === 'subs' && subsView !== 'main' ? prev : null));
    }, 100);
  };

  const renderQualityPopoverPanel = () => (
    <div className="player-surface rounded-xl p-4 shadow-2xl overflow-x-hidden">
      <div className="flex divide-x divide-white/10 max-h-[min(400px,58vh)]">
        {/* Quality Column */}
        <div className="min-w-[130px] md:min-w-[160px] max-w-[210px] flex flex-col min-h-0 pr-3 md:pr-4">
          <p className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 flex-shrink-0">
            Quality
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto custom-vertical-scroll space-y-0.5 pr-1">
            {streamResolving && sources.length === 0 ? (
              <div className="flex h-24 items-center justify-center px-3">
                <p className="text-center text-xs text-white/60">Finding best server...</p>
              </div>
            ) : hlsQualities.length > 0 ? (
              hlsQualities.map((q) => (
                <button
                  key={q.levelIndex}
                  type="button"
                  onClick={() => {
                    setSelectedHlsLevel(q.levelIndex);
                    if (hlsRef.current) {
                      hlsRef.current.currentLevel = q.levelIndex;
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                    selectedHlsLevel === q.levelIndex
                      ? 'text-white bg-white/[0.14]'
                      : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{q.label}</span>
                    {q.caption && (
                      <span className="block text-[11px] font-normal text-gray-500 mt-0.5">
                        {q.caption}
                      </span>
                    )}
                  </span>
                </button>
              ))
            ) : sources.length > 0 ? (
              sources.map((src, idx) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSelectedSourceIdx(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                    idx === selectedSourceIdx
                      ? 'text-white bg-white/[0.14]'
                      : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{src.quality}</span>
                    {qualityCaption(src.quality) && (
                      <span className="block text-[11px] font-normal text-gray-500 mt-0.5">
                        {qualityCaption(src.quality)}
                      </span>
                    )}
                  </span>
                </button>
              ))
            ) : (
              <div className="flex h-20 items-center justify-center px-3">
                <p className="text-center text-xs text-white/55">No stream loaded</p>
              </div>
            )}
          </div>
        </div>

        {/* Server Column */}
        <div className="min-w-[165px] md:min-w-[205px] max-w-[250px] flex flex-col min-h-0 pl-3 md:pl-4">
          <p className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 flex-shrink-0">
            Server
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto custom-vertical-scroll space-y-0.5 pr-1">
            {item.mediaType === 'anime' ? (
              <>
                <div className="grid grid-cols-2 gap-1 p-1 mb-1 rounded-lg bg-white/[0.05]">
                  {(['sub', 'dub'] as const).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setAnimeAudio(aud)}
                      className={`h-7 rounded-md text-[11px] font-bold uppercase transition ${
                        animeAudio === aud
                          ? 'bg-white text-black'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {aud}
                    </button>
                  ))}
                </div>
                {sources.map((src, idx) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSelectedSourceIdx(idx)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                      idx === selectedSourceIdx
                        ? 'text-white bg-white/[0.14]'
                        : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="flex-1 truncate">{src.serverName || src.label}</span>
                  </button>
                ))}
              </>
            ) : (
              (resolvedServers.length > 0 ? resolvedServers : MOVY_SERVERS).map((srv) => {
                const status = serverStatuses[srv.id] || 'idle';
                const isActive = activeServerId === srv.id;
                const isFav = favoriteServer === srv.tag;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => void switchToMovyServer(srv.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                      isActive
                        ? 'text-white bg-white/[0.14]'
                        : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <img
                      src={flagSvgUrl(srv.flagCode)}
                      alt={srv.name}
                      className="w-5 h-[15px] rounded-[3px] object-cover flex-shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{srv.name}</span>
                      {srv.note && (
                        <span className="block text-[10px] text-gray-500 truncate">
                          {srv.note}
                        </span>
                      )}
                    </span>
                    {status === 'loading' ? (
                      <Loader2 size={13} className="animate-spin text-gray-400 flex-shrink-0" />
                    ) : status === 'error' ? (
                      <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                    ) : null}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Favorite ${srv.name}`}
                      onClick={(ev) => toggleFavoriteServer(ev, srv.tag)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          toggleFavoriteServer(ev, srv.tag);
                        }
                      }}
                      className="p-1 -m-0.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer"
                    >
                      <Heart
                        width={13}
                        height={13}
                        fill={isFav ? 'rgb(239,68,68)' : 'none'}
                        stroke={isFav ? 'rgb(239,68,68)' : 'currentColor'}
                      />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Speed Row */}
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <span className="px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 flex-shrink-0">
          Speed
        </span>
        <div className="flex flex-1 items-center gap-1">
          {SPEED_OPTIONS.map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => setPlaybackSpeed(spd)}
              className={`flex-1 rounded-full px-1.5 py-1.5 text-[11.5px] font-semibold tabular-nums transition-colors ${
                playbackSpeed === spd
                  ? 'bg-white text-black'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSubsPopoverPanel = () => (
    <div className="player-surface rounded-xl p-4 shadow-2xl overflow-x-hidden">
      {subsView === 'main' ? (
        <div className="flex flex-col">
          <div className="flex divide-x divide-white/10 max-h-[min(360px,50vh)]">
            {/* Audios Column */}
            <div className="min-w-[145px] md:min-w-[180px] max-w-[230px] flex flex-col min-h-0 pr-3 md:pr-4">
              <p className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 flex-shrink-0">
                Audios
              </p>
              <div className="flex-1 min-h-0 overflow-y-auto custom-vertical-scroll space-y-0.5 pr-1">
                {hlsAudios.length > 0 ? (
                  hlsAudios.map((aud) => (
                    <button
                      key={aud.index}
                      type="button"
                      onClick={() => {
                        setSelectedHlsAudio(aud.index);
                        if (hlsRef.current) hlsRef.current.audioTrack = aud.index;
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                        selectedHlsAudio === aud.index
                          ? 'text-white bg-white/[0.14]'
                          : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="truncate">{aud.name}</span>
                    </button>
                  ))
                ) : item.mediaType === 'anime' ? (
                  ([
                    { id: 'sub', label: 'Japanese (Sub)' },
                    { id: 'dub', label: 'English (Dub)' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAnimeAudio(opt.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                        animeAudio === opt.id
                          ? 'text-white bg-white/[0.14]'
                          : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))
                ) : resolvedServers.length > 0 ? (
                  resolvedServers.map((srv) => {
                    const isActive = activeServerId === srv.id;
                    const audioLabel = (srv.note || 'Original audio').replace(/\s*audio$/i, '');
                    return (
                      <button
                        key={`aud-${srv.id}`}
                        type="button"
                        onClick={() => void switchToMovyServer(srv.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                          isActive
                            ? 'text-white bg-white/[0.14]'
                            : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        <img
                          src={flagSvgUrl(srv.flagCode)}
                          alt=""
                          className="w-4 h-3 rounded-[2px] object-cover flex-shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{audioLabel}</span>
                          <span className="block text-[10px] text-gray-500 truncate">
                            {srv.name}
                            {srv.sources[0]?.kind === 'mp4' ? ' · Direct' : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex h-24 items-center justify-center px-3">
                    <p className="text-center text-xs leading-relaxed text-white/55">
                      {streamResolving ? 'Loading audio tracks...' : 'Original audio'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Subtitles Column */}
            <div className="min-w-[155px] md:min-w-[190px] max-w-[240px] flex flex-col min-h-0 pl-3 md:pl-4">
              <p className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 flex-shrink-0">
                Subtitles
              </p>
              <div className="flex-1 min-h-0 overflow-y-auto custom-vertical-scroll space-y-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => selectSubtitle(null)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                    isSubOff || !selectedSub
                      ? 'text-white bg-white/[0.14]'
                      : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span>Off</span>
                </button>

                {selectedSub?.type === 'upload' && !isSubOff && (
                  <button
                    type="button"
                    onClick={() => selectSubtitle(selectedSub)}
                    className="w-full flex flex-col px-3 py-2 rounded-lg text-[13px] font-medium text-left text-white bg-white/[0.14]"
                  >
                    <span className="truncate">Uploaded</span>
                    <span className="text-[11px] text-gray-400 truncate">
                      {selectedSub.language}
                    </span>
                  </button>
                )}

                {subtitles.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => selectSubtitle(sub)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                      !isSubOff && selectedSub?.url === sub.url
                        ? 'text-white bg-white/[0.14]'
                        : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {sub.flagUrl && (
                      <img
                        src={sub.flagUrl}
                        alt=""
                        className="w-4 h-3 rounded-[2px] object-cover flex-shrink-0"
                      />
                    )}
                    <span className="truncate">{sub.language}</span>
                  </button>
                ))}

                {subtitles.length === 0 && selectedSub?.type !== 'upload' && (
                  <div className="flex items-center justify-center px-3 py-4">
                    <p className="text-center text-xs leading-relaxed text-white/55">
                      No subtitles yet
                    </p>
                  </div>
                )}

                {/* Upload .SRT/.VTT */}
                <div className="group relative mt-1 flex cursor-pointer select-none items-center gap-x-2 rounded-lg border border-dashed border-white/[0.14] bg-white/[0.02] px-3 py-2 text-[12.5px] font-medium text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white">
                  <input
                    type="file"
                    accept=".vtt,.srt"
                    onChange={handleUploadSubtitle}
                    className="absolute inset-0 z-10 opacity-0 cursor-pointer"
                  />
                  <Upload className="h-3.5 w-3.5 flex-shrink-0 text-white/50 group-hover:text-white/90" />
                  <span className="truncate">Upload subtitles</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 space-y-0.5">
            <button
              type="button"
              onClick={() => void openSubtitleSearchView()}
              className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-left"
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>Search OpenSubtitles</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubsView('customize')}
              className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-left"
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>Customize appearance</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden">
          <button
            type="button"
            onClick={() => setSubsView('main')}
            className="mb-3 self-start flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to subtitles</span>
          </button>

          <div className="custom-vertical-scroll max-h-[min(420px,56vh)] overflow-y-auto overflow-x-hidden pr-1">
            {subsView === 'opensubs' ? (
              searchSubsLoading ? (
                <div className="flex items-center justify-center gap-3 p-8">
                  <Loader2 className="w-5 h-5 animate-spin text-white/75" />
                  <span className="text-sm text-white/70">Loading subtitles...</span>
                </div>
              ) : searchSubsList.length === 0 ? (
                <div className="flex items-center justify-center p-8">
                  <span className="text-sm text-white/60">No subtitles available</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {searchSubsList.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => selectSubtitle(sub)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-left transition-colors ${
                        !isSubOff && selectedSub?.url === sub.url
                          ? 'text-white bg-white/[0.14]'
                          : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {sub.flagUrl && (
                        <img
                          src={sub.flagUrl}
                          alt=""
                          className="w-5 h-[15px] rounded-[3px] object-cover flex-shrink-0"
                        />
                      )}
                      <span className="flex-1 min-w-0 truncate">{sub.language}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              /* Customize Appearance Tab */
              <div className="space-y-4 py-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                      Font Size
                    </span>
                    <span className="text-[13px] font-semibold text-white tabular-nums">
                      {subtitleSettings.fontSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={16}
                    max={50}
                    step={1}
                    value={subtitleSettings.fontSize}
                    onChange={(e) =>
                      updateSubtitleSettings({ fontSize: Number(e.target.value) })
                    }
                    className="vp-range w-full"
                    style={{
                      background: `linear-gradient(to right, #fff ${
                        ((subtitleSettings.fontSize - 16) / 34) * 100
                      }%, rgba(255,255,255,0.14) ${
                        ((subtitleSettings.fontSize - 16) / 34) * 100
                      }%)`,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                      Background Opacity
                    </span>
                    <span className="text-[13px] font-semibold text-white tabular-nums">
                      {Math.round(subtitleSettings.backgroundOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={subtitleSettings.backgroundOpacity}
                    onChange={(e) =>
                      updateSubtitleSettings({
                        backgroundOpacity: Number(e.target.value),
                      })
                    }
                    className="vp-range w-full"
                    style={{
                      background: `linear-gradient(to right, #fff ${
                        subtitleSettings.backgroundOpacity * 100
                      }%, rgba(255,255,255,0.14) ${
                        subtitleSettings.backgroundOpacity * 100
                      }%)`,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                    Color
                  </span>
                  <div className="flex items-center gap-2">
                    <label
                      className="relative h-8 w-8 flex-shrink-0 cursor-pointer rounded-full ring-1 ring-inset ring-white/25"
                      style={{ backgroundColor: subtitleSettings.color }}
                    >
                      <input
                        type="color"
                        value={subtitleSettings.color}
                        onChange={(e) =>
                          updateSubtitleSettings({ color: e.target.value })
                        }
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    {['#fcf4f4', '#fde047', '#38bdf8', '#86efac'].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => updateSubtitleSettings({ color: hex })}
                        aria-label={`Subtitle color ${hex}`}
                        className={`h-7 w-7 rounded-full border transition ${
                          subtitleSettings.color.toLowerCase() === hex
                            ? 'border-white scale-110'
                            : 'border-white/20'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                    Latency
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubLatency((l) => Number((l - 0.5).toFixed(1)))}
                      className="h-8 px-3 rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-white/80 hover:bg-white/10"
                    >
                      -0.5s
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={subLatency}
                      onChange={(e) => setSubLatency(Number(e.target.value) || 0)}
                      className="flex-1 min-w-0 h-8 rounded-full bg-white/[0.04] border border-white/10 text-center text-xs text-white tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setSubLatency((l) => Number((l + 0.5).toFixed(1)))}
                      className="h-8 px-3 rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-white/80 hover:bg-white/10"
                    >
                      +0.5s
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSubLatency(0);
                    updateSubtitleSettings({
                      fontSize: isTouchDevice ? 23 : 30,
                      backgroundOpacity: 0.45,
                      color: '#fcf4f4',
                    });
                  }}
                  className="w-full h-8 rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      id="vp-shell"
      ref={shellRef}
      className={`fixed inset-0 vp-root w-[100dvw] h-[100dvh] overflow-hidden select-none ${
        isFullscreen ? 'z-[999]' : 'z-[90]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${detailItem.title}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* If all servers failed after probing and no active stream exists, render Movy's vp-notfound UI */}
      {!streamResolving && streamFailedAll && !activeSource ? (
        <div className="vp-notfound relative flex h-full w-full flex-col items-center justify-center px-5 py-6">
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between h-20 px-6 md:px-10">
            <button
              type="button"
              onClick={onClose}
              aria-label="Go back"
              className="text-white/85 hover:text-white vp-scale p-1"
            >
              <MovyBackIcon className="vp-icon-lg" />
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenDownload({
                  item: detailItem,
                  seasonNumber,
                  episode: currentEpisode,
                  animeAudio,
                })
              }
              className={TOP_BAR_BTN_CLASS}
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          </div>

          <div className="flex w-full max-w-md flex-col items-center text-center">
            <div
              className="vp-notfound-icon flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/85"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-[46%] w-[46%]">
                <path d="M9 7.2v9.6l8.2-4.8L9 7.2Z" fill="currentColor" />
                <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="vp-notfound-title mt-4 font-semibold tracking-tight text-white">
              This title isn&apos;t available
            </h2>
            <p className="vp-notfound-desc mt-2 leading-relaxed text-[#b3b3b3]">
              {streamErrorReason
                ? `No working stream was returned (${streamErrorReason}). Try switching to another node or retry below.`
                : 'No working stream was returned by the active server. Try switching to another node or retry below.'}
            </p>

            {item.mediaType !== 'anime' && resolvedServers.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                {resolvedServers.slice(0, 8).map((srv) => (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => void switchToMovyServer(srv.id)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition ${
                      activeServerId === srv.id
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-white/[0.04] border-white/10 text-[#b3b3b3] hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <img
                      src={flagSvgUrl(srv.flagCode)}
                      alt=""
                      className="w-4 h-3 rounded-[2px] object-cover"
                    />
                    <span>{srv.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setProbeRetryNonce((n) => n + 1)}
                className="h-9 px-5 rounded-full bg-white text-black text-xs font-bold hover:bg-white/85 transition"
              >
                Retry Servers
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-5 rounded-full border border-white/15 bg-white/[0.05] text-white text-xs font-semibold hover:bg-white/10 transition"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`vp-container relative w-full h-full flex justify-center items-center overflow-hidden ${
            !isTouchDevice && !controlsVisible && !paused ? 'vp-hidden-cursor' : ''
          }`}
          onMouseMove={() => !isTouchDevice && showControls()}
          onTouchStart={() => showControls()}
        >
          {/* Video Stage */}
          <div className="absolute inset-0 z-0" onClick={handleVideoSurfaceClick}>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              controls={false}
              poster={detailItem.backdropUrl || undefined}
              crossOrigin="anonymous"
              className="w-full h-full object-contain bg-black"
              onLoadedMetadata={() => {
                const v = videoRef.current;
                if (!v) return;
                if (Number.isFinite(v.duration)) setDuration(v.duration);
                try {
                  const saved = Number(localStorage.getItem(progressStorageKey));
                  if (Number.isFinite(saved) && saved > 10 && saved < v.duration - 25) {
                    v.currentTime = saved;
                    setCurrentTime(saved);
                  }
                } catch {
                  // Ignore
                }
              }}
              onLoadedData={() => {
                setLoadedData(true);
                setBuffering(false);
              }}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => {
                setBuffering(false);
                setLoadedData(true);
                setPaused(false);
              }}
              onPause={() => setPaused(true)}
              onTimeUpdate={() => {
                const v = videoRef.current;
                if (!v) return;
                if (!isSeeking) {
                  setCurrentTime(v.currentTime);
                }
                if (Number.isFinite(v.duration)) setDuration(v.duration);
                if (v.buffered.length > 0) {
                  setBufferedEnd(v.buffered.end(v.buffered.length - 1));
                }
                if (Math.floor(v.currentTime) % 5 === 0 && v.currentTime > 3) {
                  try {
                    localStorage.setItem(progressStorageKey, String(Math.floor(v.currentTime)));
                  } catch {
                    // Ignore
                  }
                }
              }}
              onEnded={() => {
                setPaused(true);
                if (nextEpisode) {
                  setCurrentEpisode(nextEpisode);
                }
              }}
              onError={() => {
                if (selectedSourceIdx + 1 < sources.length) {
                  setSelectedSourceIdx((prev) => prev + 1);
                } else if (activeSource) {
                  setBuffering(false);
                }
              }}
            >
              {isIOS && isFullscreen && iosVttUrl && !isSubOff && (
                <track
                  kind="subtitles"
                  src={iosVttUrl}
                  srcLang={selectedSub?.langCode || 'en'}
                  label={selectedSub?.language || 'Subtitles'}
                  default
                />
              )}
            </video>
          </div>

          {/* Movy Content Rating Badge */}
          {showRatingBadge && detailItem.certification && (
            <div className="vp-rating-badge" aria-hidden="true">
              <span className="w-[3px] min-h-[2.2em] bg-[#e50914] shadow-[0_0_10px_rgba(0,0,0,0.45)]" />
              <div className="pl-3">
                <div className="text-white text-sm md:text-base font-bold tracking-wider uppercase leading-tight drop-shadow">
                  Rated {detailItem.certification}
                </div>
                {detailItem.genres.length > 0 && (
                  <div className="text-white/90 text-xs mt-0.5 drop-shadow">
                    {detailItem.genres.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Double-Tap / Keyboard Streak Seek Feedback */}
          {seekFeedback && (
            <div
              key={seekFeedback.key}
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-20 px-4 py-2.5 rounded-full bg-black/65 backdrop-blur-md text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xl ${
                seekFeedback.side === 'back' ? 'left-[14%]' : 'right-[14%]'
              }`}
            >
              {seekFeedback.side === 'back' ? (
                <>
                  <MovyBackward10Svg className="w-5 h-5" />
                  <span>-{seekFeedback.seconds}s</span>
                </>
              ) : (
                <>
                  <span>+{seekFeedback.seconds}s</span>
                  <MovyForward10Svg className="w-5 h-5" />
                </>
              )}
            </div>
          )}

          {/* Top-Center Frosted OSD Indicator (Volume / Mobile Volume Boost / Subtitles Toggle) */}
          <div
            aria-live="polite"
            className={`pointer-events-none absolute top-16 md:top-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-2xl px-3.5 py-1.5 rounded-2xl border border-white/15 shadow-2xl flex items-center gap-2 transition-all duration-200 ${
              osdBadge.show
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-95 -translate-y-2'
            }`}
          >
            {osdBadge.kind === 'volume' ? (
              <span style={{ color: osdBadge.color }} className="flex items-center">
                <MovyVolumeSvg
                  level={osdBadge.volumeLevel ?? 100}
                  muted={Boolean(osdBadge.muted)}
                  className="w-4 h-4 flex-none"
                />
              </span>
            ) : (
              <MovyCcSvg className="w-4 h-4 flex-none text-white" />
            )}
            <span
              className="text-xs sm:text-sm font-bold tracking-wide tabular-nums"
              style={{ color: osdBadge.color }}
            >
              {osdBadge.text}
            </span>
          </div>

          {/* Desktop Center Play/Pause Keyboard Pulse */}
          {!isTouchDevice && centerPulse && !streamResolving && !buffering && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-white/[0.1] border border-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-2xl transition-all duration-200">
                {centerPulse === 'play' ? (
                  <MovyPlaySvg className="w-7 h-7" />
                ) : (
                  <MovyPauseSvg className="w-7 h-7" />
                )}
              </div>
            </div>
          )}

          {/* Desktop Center Loading Ring */}
          {!isTouchDevice && (streamResolving || buffering) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <MovyLoaderRing />
              {streamResolving && (
                <span className="text-xs font-medium text-white/75 drop-shadow">
                  Connecting to{' '}
                  {(resolvedServers.length > 0 ? resolvedServers : MOVY_SERVERS).find(
                    (s) => s.id === activeServerId,
                  )?.name || 'stream server'}
                  ...
                </span>
              )}
            </div>
          )}

          {/* Mobile Center Controls Overlay (Exact Movy SVG Buttons & Ring Spinner) */}
          {isTouchDevice && (controlsVisible || streamResolving || buffering) && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              onClick={handleVideoSurfaceClick}
            >
              <div
                className="flex items-center justify-center vp-mobile-center-controls pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onPointerEnter={() => setIsPointerOverUI(true)}
                onPointerLeave={() => setIsPointerOverUI(false)}
              >
                <button
                  type="button"
                  onClick={() => seekBy(-10)}
                  aria-label="Backward 10 seconds"
                  className="p-2 rounded-full hover:bg-white/20 active:scale-110 transition text-white"
                >
                  <MovyBackward10Svg />
                </button>

                {loadedData && (!buffering || paused) && !streamResolving ? (
                  <button
                    type="button"
                    onClick={() => togglePlayPause()}
                    aria-label={paused ? 'Play' : 'Pause'}
                    className="p-2 rounded-full hover:bg-white/20 active:scale-110 transition text-white"
                  >
                    {paused ? <MovyPlaySvg /> : <MovyPauseSvg />}
                  </button>
                ) : (
                  <div className="p-2 flex items-center justify-center" aria-label="Loading">
                    <MovyLoaderRing />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => seekBy(10)}
                  aria-label="Forward 10 seconds"
                  className="p-2 rounded-full hover:bg-white/20 active:scale-110 transition text-white"
                >
                  <MovyForward10Svg />
                </button>
              </div>
            </div>
          )}

          {/* Movy Custom .vp-cue Subtitle Overlay */}
          {!isSubOff && activeCueHtml && !(isIOS && isFullscreen) && (
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-[90%] pointer-events-none z-20 text-center leading-snug transition-[bottom] duration-200 ease-out ${
                isTouchDevice
                  ? 'vp-mobile-sub-container'
                  : controlsVisible
                    ? 'bottom-40'
                    : 'bottom-14'
              }`}
              style={
                {
                  color: subtitleSettings.color,
                  fontSize: `${subtitleSettings.fontSize}px`,
                  textShadow: '0 1px 2px rgba(0,0,0,0.75), 0 0 4px rgba(0,0,0,0.55)',
                  '--cue-bg': `rgba(0, 0, 0, ${subtitleSettings.backgroundOpacity})`,
                } as React.CSSProperties
              }
            >
              <span
                className="vp-cue"
                dangerouslySetInnerHTML={{ __html: activeCueHtml }}
              />
            </div>
          )}

          {/* TopHeader Bar */}
          <div
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
            }}
            onPointerEnter={() => setIsPointerOverUI(true)}
            onPointerLeave={() => setIsPointerOverUI(false)}
            onTouchStart={() => showControls()}
            aria-hidden={!controlsVisible}
            className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between h-[64px] md:h-20 lg:h-24 md:px-10 gap-x-2 md:gap-x-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-[opacity,transform] duration-300 ${
              controlsVisible
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 -translate-y-2 pointer-events-none'
            }`}
          >
            {/* Left: Back Arrow + Title + Subtitle */}
            <div className="flex items-center flex-1 min-w-0 gap-x-2.5 md:gap-x-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="flex-shrink-0 p-1 text-white/95 hover:text-white cursor-pointer vp-scale"
              >
                <MovyBackIcon className="vp-icon-lg" />
              </button>

              <div className="min-w-0">
                <h1 className="text-white font-bold text-sm sm:text-base md:text-xl leading-tight tracking-wide truncate drop-shadow-md">
                  {detailItem.title}
                </h1>
                {headerSubtitle && (
                  <p className="text-white/70 font-medium text-[11px] sm:text-xs md:text-sm mt-0.5 truncate drop-shadow-md">
                    {headerSubtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Right Top Controls Pill */}
            {isTouchDevice ? (
              /* Mobile Top-Right Frosted Pill: [Episodes? | Next Ep? | CC | Volume Boost | Quality] */
              <div className={`${PILL_GROUP_CLASS} px-1.5 py-1 gap-0.5 flex-shrink-0`}>
                {(item.mediaType === 'tv' || item.mediaType === 'anime') && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setEpisodesDrawerOpen((p) => !p);
                    }}
                    className={PILL_ICON_BTN_CLASS}
                    aria-label="Episodes"
                    title="Episodes"
                  >
                    <ListVideo className="w-4 h-4 flex-shrink-0" />
                  </button>
                )}

                {nextEpisode && (
                  <button
                    type="button"
                    onClick={() => setCurrentEpisode(nextEpisode)}
                    className={PILL_ICON_BTN_CLASS}
                    aria-label="Next Episode"
                    title="Next Episode"
                  >
                    <SkipForward className="w-4 h-4 flex-shrink-0" />
                  </button>
                )}

                {/* Audio & Subtitles (Mobile) */}
                <div ref={subsPopoverRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSubsView('main');
                      setOpenMenu((m) => (m === 'subs' ? null : 'subs'));
                    }}
                    className={PILL_ICON_BTN_CLASS}
                    aria-label="Audio and Subtitles"
                    title="Audio & Subtitles"
                  >
                    <MovyCcSvg className="w-4 h-4 flex-shrink-0" />
                  </button>

                  {openMenu === 'subs' && (
                    <div className="fixed left-1/2 top-[68px] z-50 -translate-x-1/2 max-w-[calc(100vw-0.75rem)]">
                      {renderSubsPopoverPanel()}
                    </div>
                  )}
                </div>

                {/* Mobile-Only Volume Booster (Off -> +25% Orange -> +50% Red -> Off) */}
                <button
                  type="button"
                  onClick={toggleMobileVolumeBoost}
                  className={PILL_ICON_BTN_CLASS}
                  style={{
                    color:
                      mobileBoostLevel === 2
                        ? '#ef4444'
                        : mobileBoostLevel === 1
                          ? '#f97316'
                          : undefined,
                  }}
                  aria-label={
                    mobileBoostLevel === 0
                      ? 'Volume Boost Off'
                      : mobileBoostLevel === 1
                        ? 'Volume Boost +25%'
                        : 'Volume Boost +50%'
                  }
                  title={
                    mobileBoostLevel === 0
                      ? 'Volume Boost (Off)'
                      : mobileBoostLevel === 1
                        ? 'Volume Boost (+25%)'
                        : 'Volume Boost (+50%)'
                  }
                >
                  <MovyVolumeSvg
                    level={mobileBoostLevel === 2 ? 100 : mobileBoostLevel === 1 ? 80 : volume}
                    muted={mobileBoostLevel === 0 && isMuted}
                    className="w-4 h-4 flex-shrink-0"
                  />
                </button>

                {/* Quality & Servers (Mobile) */}
                <div ref={qualityPopoverRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenu((m) => (m === 'quality' ? null : 'quality'))}
                    className={PILL_ICON_BTN_CLASS}
                    aria-label="Quality and Servers"
                    title="Quality & Servers"
                  >
                    <MovyQualitySvg className="w-4 h-4 flex-shrink-0" />
                  </button>

                  {openMenu === 'quality' && (
                    <div className="fixed left-1/2 top-[68px] z-50 -translate-x-1/2 max-w-[calc(100vw-0.75rem)]">
                      {renderQualityPopoverPanel()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Desktop Top-Right Frosted Pill: [Episodes? | Watchlist | Download] */
              <div className={`${PILL_GROUP_CLASS} px-2 py-1 gap-0.5 flex-shrink-0`}>
                {(item.mediaType === 'tv' || item.mediaType === 'anime') && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setEpisodesDrawerOpen((p) => !p);
                    }}
                    className={PILL_ICON_BTN_CLASS}
                    aria-label="Episodes"
                  >
                    <ListVideo className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden lg:inline">Episodes</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleWatchlist(detailItem)}
                  aria-label={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  title={inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                  className={`${PILL_ICON_BTN_CLASS} ${
                    inWatchlist ? '!text-[#ff4651]' : ''
                  }`}
                >
                  {inWatchlist ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <Bookmark className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="hidden xl:inline">
                    {inWatchlist ? 'Saved' : 'Watchlist'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenDownload({
                      item: detailItem,
                      seasonNumber,
                      episode: currentEpisode,
                      animeAudio,
                    })
                  }
                  aria-label="Download"
                  className={PILL_ICON_BTN_CLASS}
                >
                  <Download className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline">Download</span>
                  {activeDownloads.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#e50914] text-[10px] font-bold text-white tabular-nums">
                      {overallProgress}%
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Bottom Controls Layer */}
          <div
            onPointerEnter={() => setIsPointerOverUI(true)}
            onPointerLeave={() => setIsPointerOverUI(false)}
            onTouchStart={() => showControls()}
            className="absolute bottom-0 left-0 right-0 z-30 h-44 flex items-end pointer-events-none"
          >
            <div
              aria-hidden={!controlsVisible}
              style={{
                paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                paddingLeft: 'max(0rem, env(safe-area-inset-left))',
                paddingRight: 'max(0rem, env(safe-area-inset-right))',
              }}
              className={`w-full flex flex-col items-stretch pt-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-[opacity,transform] duration-300 ${
                controlsVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              <div
                className={`vp-controls-inner px-3 sm:px-6 md:px-10 ${
                  isTouchDevice ? 'is-mobile-chrome' : ''
                }`}
              >
                {/* Interactive Seek Bar Row: [currentTime] [SeekBar] [duration] [Mobile Fullscreen] */}
                <div className="vp-seek-row flex items-center gap-2 sm:gap-3">
                  <span className="vp-controls-time text-[11px] sm:text-xs md:text-sm font-medium text-white/90 tabular-nums flex-none !pl-0">
                    {formatClock(currentTime)}
                  </span>

                  <div
                    ref={seekBarRef}
                    onMouseDown={(e) => startSeekDrag(e.clientX)}
                    onTouchStart={(e) => {
                      if (e.touches[0]) startSeekDrag(e.touches[0].clientX);
                    }}
                    onMouseMove={(e) => {
                      const res = computeTimeAtClientX(e.clientX);
                      if (res) setSeekPreview({ time: Math.round(res.time), offsetPx: res.offsetPx });
                    }}
                    onMouseLeave={() => !isSeeking && setSeekPreview(null)}
                    className="relative flex-1 min-w-0 h-5 flex items-center cursor-pointer group"
                  >
                    {seekPreview && (
                      <div
                        className="vp-seek-preview pointer-events-none absolute -translate-x-1/2 px-2 py-1 rounded bg-black/85 border border-white/15 text-[11px] font-semibold text-white tabular-nums shadow-lg"
                        style={{ left: `${seekPreview.offsetPx}px` }}
                      >
                        {formatClock(seekPreview.time)}
                      </div>
                    )}

                    <div className="relative w-full h-1 group-hover:h-1.5 transition-[height] duration-150">
                      <div className="absolute inset-0 rounded-full bg-white/25 group-hover:bg-white/30 transition-colors" />
                      <div
                        className="absolute top-0 left-0 h-full rounded-full bg-white/35"
                        style={{ width: `${bufferedPercent}%` }}
                      />
                      <div
                        className="vp-seek-left absolute top-0 left-0 h-full rounded-full bg-[#e50914]"
                        style={{ width: `${progressPercent}%` }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-md" />
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] sm:text-xs md:text-sm font-medium text-white/75 tabular-nums flex-none">
                    {formatClock(duration)}
                  </span>

                  {/* Mobile Fullscreen Button (Right of Progress Bar, ShaniStream-style) */}
                  {isTouchDevice && (
                    <button
                      id="ButtonFullscreen"
                      type="button"
                      onClick={() => void toggleFullscreen()}
                      aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                      className="tabbable p-1.5 text-white/95 hover:text-white active:scale-95 transition flex-none"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Controls Row */}
                {isTouchDevice ? (
                  /* Mobile Secondary Compact Pill Row: Watchlist & Download */
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className={`${PILL_GROUP_CLASS} px-1.5 py-0.5 gap-0.5`}>
                      <button
                        type="button"
                        onClick={() => onToggleWatchlist(detailItem)}
                        aria-label={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                        className={`${PILL_ICON_BTN_CLASS} ${
                          inWatchlist ? '!text-[#ff4651]' : ''
                        }`}
                      >
                        {inWatchlist ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                        <span className="text-[11px]">{inWatchlist ? 'Saved' : 'Watchlist'}</span>
                      </button>

                      <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

                      <button
                        type="button"
                        onClick={() =>
                          onOpenDownload({
                            item: detailItem,
                            seasonNumber,
                            episode: currentEpisode,
                            animeAudio,
                          })
                        }
                        aria-label="Download"
                        className={PILL_ICON_BTN_CLASS}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Download</span>
                        {activeDownloads.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#e50914] text-[10px] font-bold text-white tabular-nums">
                            {overallProgress}%
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Desktop Grouped Frosted Pills (ShaniStream Bottom Layout) */
                  <div className="relative mt-2 md:mt-2.5 flex w-full items-center justify-between gap-3.5">
                    {/* Left Pill: [Play/Pause | -10s | +10s | Next Ep? | Divider | Volume (Hover Slider)] */}
                    <div className={`${PILL_GROUP_CLASS} px-2.5 py-1 hover:bg-white/[0.12] transition-colors`}>
                      <button
                        id="ButtonPlay"
                        type="button"
                        onClick={() => togglePlayPause()}
                        aria-label={paused ? 'Play (k)' : 'Pause (k)'}
                        className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center active:scale-95"
                      >
                        <span className="text-xl flex items-center justify-center w-[1em] h-[1em]">
                          {paused ? (
                            <MovyPlaySvg className="w-[0.85em] h-[0.85em]" />
                          ) : (
                            <MovyPauseSvg className="w-[0.85em] h-[0.85em]" />
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => seekBy(-10)}
                        aria-label="Backward 10 seconds"
                        className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center active:scale-95"
                      >
                        <MovyBackward10Svg className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => seekBy(10)}
                        aria-label="Forward 10 seconds"
                        className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center active:scale-95"
                      >
                        <MovyForward10Svg className="w-5 h-5" />
                      </button>

                      {nextEpisode && (
                        <button
                          type="button"
                          onClick={() => setCurrentEpisode(nextEpisode)}
                          aria-label="Next Episode"
                          title="Next Episode"
                          className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center gap-1 active:scale-95 ml-0.5"
                        >
                          <SkipForward className="w-4 h-4" />
                          <span className="hidden lg:inline text-xs font-semibold pr-0.5">
                            Next Ep
                          </span>
                        </button>
                      )}

                      <div className="w-[1px] h-4 bg-white/20 mx-1.5" />

                      {/* Hover-expanding Volume */}
                      <div className="flex items-center group">
                        <button
                          id="ButtonVolume"
                          type="button"
                          onClick={() => {
                            setIsMuted((m) => {
                              const next = !m;
                              triggerVolumeOsd(next ? 0 : volume, next);
                              return next;
                            });
                            if (volume === 0) setVolume(100);
                          }}
                          aria-label={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                          className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center active:scale-95"
                        >
                          <MovyVolumeSvg level={volume} muted={isMuted} className="w-5 h-5" />
                        </button>

                        <div className="relative flex items-center justify-start w-0 overflow-hidden transition-[width,opacity] duration-300 group-hover:w-28 opacity-0 group-hover:opacity-100">
                          <div className="flex h-8 w-28 items-center gap-2 px-1.5">
                            <div className="relative h-1 flex-1 rounded-full bg-white/25">
                              <div
                                className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full bg-white"
                                style={{ width: isMuted ? '0%' : `${volume}%` }}
                              >
                                <div className="absolute h-3 w-3 translate-x-1/2 rounded-full bg-white pointer-events-none" />
                              </div>
                              <input
                                type="range"
                                aria-label="Volume"
                                min={0}
                                max={100}
                                value={isMuted ? 0 : volume}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  setVolume(next);
                                  setIsMuted(next === 0);
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
                              />
                            </div>
                            <span className="text-[11px] font-bold text-white/90 tabular-nums min-w-[30px] text-right">
                              {isMuted ? '0%' : `${volume}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Pill: [Audio & Subtitles (CC) | Quality & Servers | Divider | Fullscreen] */}
                    <div className={`${PILL_GROUP_CLASS} px-2.5 py-1 hover:bg-white/[0.12] transition-colors`}>
                      {/* Audio & Subtitles Popover (Desktop Upward) */}
                      <div
                        ref={subsPopoverRef}
                        className="relative"
                        onPointerEnter={(e) => e.pointerType === 'mouse' && hoverMenuOpen('subs')}
                        onPointerLeave={(e) => e.pointerType === 'mouse' && hoverMenuLeave()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSubsView('main');
                            setOpenMenu((m) => (m === 'subs' ? null : 'subs'));
                          }}
                          className={PILL_ICON_BTN_CLASS}
                          aria-label="Audio and Subtitles (c)"
                          title="Audio & Subtitles (c)"
                        >
                          <MovyCcSvg className="w-5 h-5 flex-shrink-0" />
                          <span className="hidden xl:inline text-xs">Audio &amp; Subtitles</span>
                        </button>

                        {openMenu === 'subs' && (
                          <div className="absolute right-0 bottom-full pb-3 z-50">
                            {renderSubsPopoverPanel()}
                          </div>
                        )}
                      </div>

                      {/* Quality & Server Popover (Desktop Upward) */}
                      <div
                        ref={qualityPopoverRef}
                        className="relative ml-0.5"
                        onPointerEnter={(e) => e.pointerType === 'mouse' && hoverMenuOpen('quality')}
                        onPointerLeave={(e) => e.pointerType === 'mouse' && hoverMenuLeave()}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenMenu((m) => (m === 'quality' ? null : 'quality'))}
                          className={PILL_ICON_BTN_CLASS}
                          aria-label="Quality and Servers"
                          title="Quality & Servers"
                        >
                          <MovyQualitySvg className="w-5 h-5 flex-shrink-0" />
                          <span className="hidden xl:inline text-xs">Quality</span>
                          {activeQualityText && (
                            <span className="hidden lg:inline text-[11px] opacity-65 font-normal">
                              {activeQualityText}
                            </span>
                          )}
                        </button>

                        {openMenu === 'quality' && (
                          <div className="absolute right-0 bottom-full pb-3 z-50">
                            {renderQualityPopoverPanel()}
                          </div>
                        )}
                      </div>

                      <div className="w-[1px] h-4 bg-white/20 mx-1.5" />

                      <button
                        id="ButtonFullscreen"
                        type="button"
                        onClick={() => void toggleFullscreen()}
                        aria-label={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
                        title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
                        className="tabbable p-1.5 rounded-xl border border-transparent hover:bg-white/10 text-white transition-all flex items-center active:scale-95"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="w-5 h-5" />
                        ) : (
                          <Maximize2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Episodes Drawer (TV & Anime) */}
          {episodesDrawerOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex justify-end"
              onClick={() => setEpisodesDrawerOpen(false)}
            >
              <aside
                className="w-full max-w-[380px] h-full player-surface border-l border-white/10 p-4 flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white truncate">Episodes</h2>
                    <p className="text-xs text-white/60 truncate">{detailItem.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEpisodesDrawerOpen(false)}
                    aria-label="Close episodes"
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {item.mediaType === 'tv' && seasonOptions.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                    {seasonOptions.map((sNum) => (
                      <button
                        key={sNum}
                        type="button"
                        onClick={() => setSeasonNumber(sNum)}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                          seasonNumber === sNum
                            ? 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/75 hover:bg-white/15 hover:text-white'
                        }`}
                      >
                        Season {sNum}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto custom-vertical-scroll space-y-2 pr-1">
                  {episodesLoading ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-white/70" />
                    </div>
                  ) : episodes.length === 0 ? (
                    <p className="text-xs text-white/60 py-8 text-center">No episodes found.</p>
                  ) : (
                    episodes.map((ep) => {
                      const active = currentEpisode?.episodeNumber === ep.episodeNumber;
                      return (
                        <button
                          key={ep.id}
                          type="button"
                          onClick={() => {
                            setCurrentEpisode(ep);
                            setEpisodesDrawerOpen(false);
                          }}
                          className={`w-full flex items-start gap-3 p-2.5 rounded-xl border text-left transition ${
                            active
                              ? 'bg-white/[0.14] border-white/30'
                              : 'player-tile border-white/[0.08]'
                          }`}
                        >
                          {ep.stillUrl ? (
                            <img
                              src={ep.stillUrl}
                              alt=""
                              className="w-24 aspect-video rounded-lg object-cover flex-shrink-0 bg-black/50"
                            />
                          ) : (
                            <div className="w-16 aspect-video rounded-lg bg-white/[0.06] flex items-center justify-center text-xs font-bold text-white/75 flex-shrink-0 tabular-nums">
                              E{ep.episodeNumber}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">
                              {ep.episodeNumber}. {ep.title}
                            </p>
                            {ep.overview && (
                              <p className="text-[11px] text-white/60 line-clamp-2 mt-0.5">
                                {ep.overview}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
