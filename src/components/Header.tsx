import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Bookmark, Download, X } from 'lucide-react';
import { MoviesxMark } from '@/src/components/BrandMark';
import { HeaderSearch } from '@/src/components/HeaderSearch';
import { useDownloadManager } from '@/src/context/DownloadContext';
import type { MediaItem, NavTab } from '@/src/types/media';

interface HeaderProps {
  activeTab: NavTab;
  isHeroPage?: boolean;
  onSelectTab: (tab: NavTab) => void;
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  watchlistCount: number;
  onPlayMedia: (item: MediaItem) => void;
  onSelectMedia: (item: MediaItem) => void;
}

const SEARCH_TRANSITION = { duration: 0.58, ease: [0.22, 1, 0.36, 1] as const };

interface MarkerRect {
  left: number;
  width: number;
}

const slidingMarkerCache = new Map<string, MarkerRect>();

function useSlidingMarker(
  cacheKey: string,
  containerRef: React.RefObject<HTMLElement | null>,
  activeDep: string | number | null,
) {
  const [rect, setRect] = useState<MarkerRect | null>(null);
  const [animated, setAnimated] = useState(false);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeNodes = container?.querySelectorAll<HTMLElement>('[data-marker-active="true"]');
    const activeEl = activeNodes && activeNodes.length > 0 ? activeNodes[activeNodes.length - 1] : null;
    if (!container || !activeEl) {
      mountedRef.current = false;
      setRect(null);
      return;
    }

    const nextRect: MarkerRect = { left: activeEl.offsetLeft, width: activeEl.offsetWidth };
    const prevCached = slidingMarkerCache.get(cacheKey);
    slidingMarkerCache.set(cacheKey, nextRect);

    if (
      !mountedRef.current &&
      prevCached &&
      (Math.abs(prevCached.left - nextRect.left) > 0.5 ||
        Math.abs(prevCached.width - nextRect.width) > 0.5)
    ) {
      mountedRef.current = true;
      setAnimated(false);
      setRect(prevCached);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setAnimated(true);
          setRect(nextRect);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setAnimated(mountedRef.current);
    mountedRef.current = true;
    setRect(nextRect);
  }, [cacheKey, containerRef, activeDep]);

  useEffect(() => {
    const sync = () => {
      const container = containerRef.current;
      const activeNodes = container?.querySelectorAll<HTMLElement>('[data-marker-active="true"]');
      const activeEl =
        activeNodes && activeNodes.length > 0 ? activeNodes[activeNodes.length - 1] : null;
      if (!activeEl) return;
      const nextRect: MarkerRect = { left: activeEl.offsetLeft, width: activeEl.offsetWidth };
      slidingMarkerCache.set(cacheKey, nextRect);
      setAnimated(false);
      setRect(nextRect);
    };
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [cacheKey, containerRef]);

  const style: React.CSSProperties = {
    transform: `translateX(${rect?.left ?? 0}px)`,
    width: rect?.width ?? 0,
    opacity: rect ? 1 : 0,
    transition: animated
      ? 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease'
      : 'opacity 0.2s ease',
  };

  return style;
}

const HomeIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'shrink-0',
  size = 14,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 23.6719 22.1631"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillOpacity="0.85"
      d="M14.1699 18.938L9.13086 18.938L9.13086 12.4829C9.13086 12.0337 9.43359 11.7407 9.88281 11.7407L13.4277 11.7407C13.877 11.7407 14.1699 12.0337 14.1699 12.4829ZM3.04688 18.3521C3.04688 19.7095 3.86719 20.5103 5.24414 20.5103L18.0859 20.5103C19.4629 20.5103 20.2734 19.7095 20.2734 18.3521L20.2734 10.6177L12.2461 3.88916C11.875 3.57666 11.4355 3.58643 11.0742 3.88916L3.04688 10.6177ZM0 9.64111C0 10.0415 0.3125 10.4224 0.839844 10.4224C1.11328 10.4224 1.33789 10.2759 1.54297 10.1099L11.3184 1.90674C11.5332 1.71143 11.7969 1.71143 12.0117 1.90674L21.7871 10.1099C21.9824 10.2759 22.207 10.4224 22.4805 10.4224C22.9395 10.4224 23.3105 10.1392 23.3105 9.67041C23.3105 9.37744 23.2129 9.18213 23.0078 9.00635L12.8418 0.461426C12.1191-0.153809 11.2207-0.153809 10.4883 0.461426L0.3125 9.00635C0.0976562 9.18213 0 9.4165 0 9.64111ZM17.8223 5.23682L20.2734 7.30713L20.2734 2.79541C20.2734 2.36572 20 2.09229 19.5703 2.09229L18.5254 2.09229C18.1055 2.09229 17.8223 2.36572 17.8223 2.79541Z"
    />
  </svg>
);

const MoviesIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'shrink-0',
  size = 14,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 23.3887 18.0176"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillOpacity="0.85"
      d="M1.98242 18.0176L21.0449 18.0176C22.2559 18.0176 23.0273 17.2461 23.0273 16.0645L23.0273 1.97266C23.0273 0.800781 22.2559 0.0292969 21.0449 0.0292969L1.98242 0.0292969C0.78125 0.0292969 0 0.800781 0 1.97266L0 16.0645C0 17.2461 0.78125 18.0176 1.98242 18.0176ZM1.99219 16.4453C1.67969 16.4453 1.47461 16.2305 1.47461 15.9375L1.47461 14.834C1.47461 14.5605 1.66992 14.3652 1.95312 14.3652L3.21289 14.3652C3.49609 14.3652 3.68164 14.5605 3.68164 14.834L3.68164 15.9668C3.68164 16.2402 3.49609 16.4453 3.21289 16.4453ZM1.95312 13.2129C1.66992 13.2129 1.47461 12.998 1.47461 12.7441L1.47461 11.6309C1.47461 11.3379 1.66016 11.1523 1.95312 11.1523L3.21289 11.1523C3.49609 11.1523 3.68164 11.3379 3.68164 11.6309L3.68164 12.7441C3.68164 12.998 3.49609 13.2129 3.21289 13.2129ZM1.95312 10.0488C1.66992 10.0488 1.47461 9.84375 1.47461 9.58984L1.47461 8.47656C1.47461 8.18359 1.66016 7.99805 1.95312 7.99805L3.21289 7.99805C3.49609 7.99805 3.68164 8.18359 3.68164 8.47656L3.68164 9.58984C3.68164 9.84375 3.49609 10.0488 3.21289 10.0488ZM1.95312 6.91406C1.66992 6.91406 1.47461 6.69922 1.47461 6.45508L1.47461 5.33203C1.47461 5.04883 1.66016 4.85352 1.95312 4.85352L3.21289 4.85352C3.49609 4.85352 3.68164 5.04883 3.68164 5.33203L3.68164 6.45508C3.68164 6.69922 3.49609 6.91406 3.21289 6.91406ZM1.95312 3.68164C1.66992 3.68164 1.47461 3.47656 1.47461 3.22266L1.47461 2.11914C1.47461 1.80664 1.67969 1.60156 1.99219 1.60156L3.21289 1.60156C3.49609 1.60156 3.68164 1.79688 3.68164 2.08008L3.68164 3.22266C3.68164 3.47656 3.49609 3.68164 3.21289 3.68164ZM5.52734 16.4453C5.23438 16.4453 5.05859 16.2695 5.05859 15.9766L5.05859 10.2832C5.05859 10 5.23438 9.82422 5.52734 9.82422L17.5098 9.82422C17.793 9.82422 17.9688 10 17.9688 10.2832L17.9688 15.9766C17.9688 16.2695 17.793 16.4453 17.5098 16.4453ZM5.52734 8.24219C5.23438 8.24219 5.05859 8.07617 5.05859 7.7832L5.05859 2.05078C5.05859 1.75781 5.23438 1.60156 5.52734 1.60156L17.5098 1.60156C17.793 1.60156 17.9688 1.75781 17.9688 2.05078L17.9688 7.7832C17.9688 8.07617 17.793 8.24219 17.5098 8.24219ZM19.8145 16.4453C19.5312 16.4453 19.3457 16.2402 19.3457 15.9668L19.3457 14.834C19.3457 14.5605 19.5312 14.3652 19.8145 14.3652L21.0742 14.3652C21.3672 14.3652 21.5527 14.5605 21.5527 14.834L21.5527 15.9375C21.5527 16.2305 21.3574 16.4453 21.0352 16.4453ZM19.8145 13.2129C19.5312 13.2129 19.3457 12.998 19.3457 12.7441L19.3457 11.6309C19.3457 11.3379 19.5312 11.1523 19.8145 11.1523L21.0742 11.1523C21.3672 11.1523 21.5527 11.3379 21.5527 11.6309L21.5527 12.7441C21.5527 12.998 21.3672 13.2129 21.0742 13.2129ZM19.8145 10.0488C19.5312 10.0488 19.3457 9.84375 19.3457 9.58984L19.3457 8.47656C19.3457 8.18359 19.5312 7.99805 19.8145 7.99805L21.0742 7.99805C21.3672 7.99805 21.5527 8.18359 21.5527 8.47656L21.5527 9.58984C21.5527 9.84375 21.3672 10.0488 21.0742 10.0488ZM19.8145 6.91406C19.5312 6.91406 19.3457 6.69922 19.3457 6.45508L19.3457 5.33203C19.3457 5.04883 19.5312 4.85352 19.8145 4.85352L21.0742 4.85352C21.3672 4.85352 21.5527 5.04883 21.5527 5.33203L21.5527 6.45508C21.5527 6.69922 21.3672 6.91406 21.0742 6.91406ZM19.8145 3.68164C19.5312 3.68164 19.3457 3.47656 19.3457 3.22266L19.3457 2.08008C19.3457 1.79688 19.5312 1.60156 19.8145 1.60156L21.0352 1.60156C21.3574 1.60156 21.5527 1.80664 21.5527 2.11914L21.5527 3.22266C21.5527 3.47656 21.3672 3.68164 21.0742 3.68164Z"
    />
  </svg>
);

const ShowsIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'shrink-0',
  size = 14,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24.7754 19.541"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillOpacity="0.2125"
      d="M2.53906 14.6484C1.93359 14.6484 1.57227 14.2871 1.57227 13.6914L1.57227 2.5293C1.57227 1.93359 1.93359 1.57227 2.53906 1.57227L21.875 1.57227C22.4805 1.57227 22.8418 1.93359 22.8418 2.5293L22.8418 13.6914C22.8418 14.2871 22.4805 14.6484 21.875 14.6484Z"
    />
    <path
      fillOpacity="0.85"
      d="M2.50977 16.2207L21.9043 16.2207C23.4668 16.2207 24.4141 15.2637 24.4141 13.7109L24.4141 2.50977C24.4141 0.957031 23.4668 0 21.9043 0L2.50977 0C0.957031 0 0 0.957031 0 2.50977L0 13.7109C0 15.2637 0.957031 16.2207 2.50977 16.2207ZM2.53906 14.6484C1.93359 14.6484 1.57227 14.2871 1.57227 13.6914L1.57227 2.5293C1.57227 1.93359 1.93359 1.57227 2.53906 1.57227L21.875 1.57227C22.4805 1.57227 22.8418 1.93359 22.8418 2.5293L22.8418 13.6914C22.8418 14.2871 22.4805 14.6484 21.875 14.6484ZM7.29492 19.5312L17.1191 19.5312C17.5488 19.5312 17.9102 19.1797 17.9102 18.7402C17.9102 18.3008 17.5488 17.9492 17.1191 17.9492L7.29492 17.9492C6.86523 17.9492 6.50391 18.3008 6.50391 18.7402C6.50391 19.1797 6.86523 19.5312 7.29492 19.5312Z"
    />
  </svg>
);

const AnimeIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'shrink-0',
  size = 14,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 22.0527 22.1191"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillOpacity="0.85"
      d="M4.16109 20.5469C4.56149 20.8594 5.0693 20.752 5.67477 20.3125L10.8408 16.5137L16.0166 20.3125C16.622 20.752 17.1201 20.8594 17.5302 20.5469C17.9306 20.2441 18.0185 19.7461 17.7744 19.0332L15.7334 12.959L20.9482 9.20898C21.5537 8.7793 21.7978 8.33008 21.6416 7.8418C21.4853 7.37305 21.0263 7.13867 20.2744 7.14844L13.8779 7.1875L11.9345 1.08398C11.7002 0.361328 11.3486 0 10.8408 0C10.3427 0 9.99117 0.361328 9.7568 1.08398L7.81344 7.1875L1.41695 7.14844C0.665001 7.13867 0.206017 7.37305 0.0497668 7.8418C-0.116249 8.33008 0.137657 8.7793 0.743126 9.20898L5.95797 12.959L3.91695 19.0332C3.67281 19.7461 3.7607 20.2441 4.16109 20.5469ZM5.56734 18.6133C5.54781 18.5938 5.55758 18.584 5.56734 18.5254L7.5107 12.9395C7.64742 12.5586 7.5693 12.2559 7.2275 12.0215L2.36422 8.66211C2.31539 8.63281 2.30563 8.61328 2.31539 8.58398C2.32516 8.55469 2.34469 8.55469 2.40328 8.55469L8.31149 8.66211C8.71188 8.67188 8.96578 8.50586 9.09274 8.10547L10.792 2.45117C10.8017 2.39258 10.8213 2.37305 10.8408 2.37305C10.8701 2.37305 10.8896 2.39258 10.8994 2.45117L12.5986 8.10547C12.7255 8.50586 12.9795 8.67188 13.3798 8.66211L19.288 8.55469C19.3466 8.55469 19.3662 8.55469 19.3759 8.58398C19.3857 8.61328 19.3662 8.63281 19.3271 8.66211L14.4638 12.0215C14.122 12.2559 14.0439 12.5586 14.1806 12.9395L16.124 18.5254C16.1338 18.584 16.1435 18.5938 16.124 18.6133C16.1045 18.6426 16.0752 18.623 16.0361 18.5938L11.3388 15.0098C11.0263 14.7656 10.665 14.7656 10.3525 15.0098L5.65524 18.5938C5.61617 18.623 5.58688 18.6426 5.56734 18.6133Z"
    />
  </svg>
);

const SearchIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 19.4434 19.2676"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillOpacity="0.85"
      d="M0 7.79297C0 12.0898 3.49609 15.5859 7.79297 15.5859C9.49219 15.5859 11.0449 15.0391 12.3242 14.1211L17.1289 18.9355C17.3535 19.1602 17.6465 19.2676 17.959 19.2676C18.623 19.2676 19.082 18.7695 19.082 18.1152C19.082 17.8027 18.9648 17.5195 18.7598 17.3145L13.9844 12.5098C14.9902 11.2012 15.5859 9.57031 15.5859 7.79297C15.5859 3.49609 12.0898 0 7.79297 0C3.49609 0 0 3.49609 0 7.79297ZM1.66992 7.79297C1.66992 4.41406 4.41406 1.66992 7.79297 1.66992C11.1719 1.66992 13.916 4.41406 13.916 7.79297C13.916 11.1719 11.1719 13.916 7.79297 13.916C4.41406 13.916 1.66992 11.1719 1.66992 7.79297Z"
    />
  </svg>
);

const NAV_ITEMS: {
  id: Exclude<NavTab, 'watchlist'>;
  label: string;
  Icon: React.FC<{ className?: string; size?: number }>;
}[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'movie', label: 'Movies', Icon: MoviesIcon },
  { id: 'tv', label: 'Shows', Icon: ShowsIcon },
  { id: 'anime', label: 'Anime', Icon: AnimeIcon },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  isHeroPage = true,
  onSelectTab,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  watchlistCount,
  onPlayMedia,
  onSelectMedia,
}) => {
  const layoutGroupId = useId();
  const { activeDownloads, downloads, overallProgress, setDownloadsOpen } = useDownloadManager();
  const [scrolled, setScrolled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );
  const [navWidth, setNavWidth] = useState(0);
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  const desktopNavHostRef = useRef<HTMLElement>(null);
  const navMeasureRef = useRef<HTMLDivElement>(null);
  const desktopNavLinksRef = useRef<HTMLDivElement>(null);
  const mobileDockRef = useRef<HTMLElement>(null);
  const mobileDockHostRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const desktopSearchOpen = searchOpen && isDesktop;
  const mobileSearchOpen = searchOpen && !isDesktop;

  // Delay search dropdown reveal until the 580ms icon glide completes
  useEffect(() => {
    if (!desktopSearchOpen) {
      setPanelVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setPanelVisible(true), 580);
    return () => window.clearTimeout(timer);
  }, [desktopSearchOpen]);

  const handleCloseSearchAnimated = () => {
    if (closeTimerRef.current !== null) return;
    if (!isDesktop) {
      onCloseSearch();
      return;
    }
    setPanelClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setPanelClosing(false);
      onCloseSearch();
    }, 90);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (desktopSearchOpen) return;
    const measure = () => {
      const w = navMeasureRef.current?.scrollWidth ?? 0;
      if (w > 0) setNavWidth(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [desktopSearchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.('.header-search-cluster')) {
        handleCloseSearchAnimated();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseSearchAnimated();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const desktopMarkerStyle = useSlidingMarker('desktop-nav', desktopNavLinksRef, activeTab);
  const mobileMarkerStyle = useSlidingMarker('mobile-dock', mobileDockRef, activeTab);

  const hasActiveDownloads = activeDownloads.length > 0;
  const navLinkBase =
    'relative z-[1] inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[13px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2';
  const iconBtnClass =
    'flex items-center justify-center h-8 w-8 rounded-[8px] text-[#b3b3b3] hover:text-white hover:bg-white/[0.06] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2';

  const searchGlyphButton = (
    <motion.button
      type="button"
      layoutId={`search-icon-${layoutGroupId}`}
      transition={SEARCH_TRANSITION}
      onClick={() => {
        if (!desktopSearchOpen) onOpenSearch();
      }}
      aria-label="Search"
      aria-expanded={desktopSearchOpen}
      className={iconBtnClass}
    >
      <SearchIcon size={16} />
    </motion.button>
  );

  return (
    <>
      {/* Original Top Header */}
      <header
        className="fixed left-0 right-0 top-0 z-40 pointer-events-none"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className="absolute inset-x-0 top-0 h-20 md:h-24 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(15,15,15,0.92) 0%, rgba(15,15,15,0.55) 40%, rgba(15,15,15,0.3) 62%, rgba(15,15,15,0.13) 79%, rgba(15,15,15,0.04) 91%, rgba(15,15,15,0) 100%)',
            opacity: isHeroPage && !scrolled ? 0 : scrolled ? 1 : 0.72,
            transition: 'opacity 0.25s ease',
            transform: 'translateZ(0)',
          }}
          aria-hidden="true"
        />

        <div className="layout-container pointer-events-auto relative">
          <div className="flex items-center justify-between h-[68px] md:h-[80px]">
            <a
              href="/"
              draggable={true}
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onSelectTab('home');
                }
              }}
              className="relative z-10 inline-flex items-center shrink-0 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] focus:outline-none focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 rounded"
              aria-label="Movy Home"
            >
              <MoviesxMark className="shrink-0 h-8 md:h-9 w-auto" />
            </a>

            {/* Right Unified Nav Cluster (Desktop) — Original Movy LayoutGroup glide */}
            <LayoutGroup id={layoutGroupId}>
              <nav
                ref={desktopNavHostRef}
                className="header-search-cluster relative hidden md:flex items-center h-10 pl-1 pr-1 rounded-[12px] border border-white/[0.08] bg-[#181818] shadow-[0_12px_32px_-14px_rgba(0,0,0,0.85)]"
                aria-label="Main navigation"
              >
                {desktopSearchOpen ? searchGlyphButton : null}

                <div
                  ref={navMeasureRef}
                  className="relative h-10"
                  style={navWidth ? { width: navWidth } : undefined}
                >
                  <AnimatePresence initial={false}>
                    {desktopSearchOpen ? (
                      <motion.div
                        key="search-field"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SEARCH_TRANSITION}
                        className="absolute inset-0 z-10 h-10 overflow-hidden flex items-center"
                      >
                        <HeaderSearch
                          onClose={handleCloseSearchAnimated}
                          panelHostRef={desktopNavHostRef}
                          panelVisible={panelVisible && !panelClosing}
                          panelPlacement="below"
                          autoFocusDelay={40}
                          onPlay={onPlayMedia}
                          onSelect={onSelectMedia}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="nav-links"
                        ref={desktopNavLinksRef}
                        initial={false}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SEARCH_TRANSITION}
                        className="relative flex items-center gap-0.5 h-10 whitespace-nowrap"
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-0 top-1 h-8 rounded-[8px] bg-[#353535]"
                          style={desktopMarkerStyle}
                        />
                        {NAV_ITEMS.map(({ id, label, Icon }) => {
                          const isActive = activeTab === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onSelectTab(id)}
                              aria-current={isActive ? 'page' : undefined}
                              data-marker-active={isActive ? 'true' : undefined}
                              className={`${navLinkBase} ${
                                isActive
                                  ? 'text-white font-semibold'
                                  : 'text-[#b3b3b3] font-medium hover:text-white hover:bg-white/[0.06]'
                              }`}
                            >
                              <Icon size={14} className="shrink-0" />
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <span
                  className={`w-px h-4 mx-1.5 shrink-0 bg-white/[0.12] transition-opacity duration-200 ${
                    desktopSearchOpen ? 'opacity-0' : 'opacity-100'
                  }`}
                  aria-hidden="true"
                />

                {desktopSearchOpen ? (
                  <button
                    type="button"
                    onClick={handleCloseSearchAnimated}
                    className={`${iconBtnClass} overflow-visible`}
                    aria-label="Close search"
                  >
                    <span className="relative flex items-center justify-center w-5 h-5">
                      <motion.span
                        key="close-x"
                        initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                        transition={SEARCH_TRANSITION}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <X size={16} strokeWidth={1.75} />
                      </motion.span>
                    </span>
                  </button>
                ) : (
                  searchGlyphButton
                )}

                <button
                  type="button"
                  onClick={() => setDownloadsOpen(true)}
                  className={`relative ${iconBtnClass}`}
                  aria-label={`Downloads${
                    hasActiveDownloads ? ` (${overallProgress}%)` : ''
                  }`}
                  title="Downloads & History"
                >
                  <Download className="w-4 h-4" />
                  {hasActiveDownloads ? (
                    <span className="absolute -top-0.5 -right-0.5 px-1 min-w-[16px] h-4 rounded-full bg-[#e50914] text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
                      {overallProgress}%
                    </span>
                  ) : (
                    downloads.length > 0 && (
                      <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTab('watchlist')}
                  aria-current={activeTab === 'watchlist' ? 'page' : undefined}
                  className={`relative flex items-center justify-center h-8 w-8 rounded-[8px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2 ${
                    activeTab === 'watchlist'
                      ? 'bg-[#353535] text-white'
                      : 'text-[#b3b3b3] hover:text-white hover:bg-white/[0.06]'
                  }`}
                  aria-label={`Watchlist${watchlistCount > 0 ? ` (${watchlistCount})` : ''}`}
                  title="Watchlist"
                >
                  <Bookmark
                    className={`w-4 h-4 ${
                      activeTab === 'watchlist' ? 'fill-current' : ''
                    }`}
                  />
                  {watchlistCount > 0 && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#e50914]" />
                  )}
                </button>
              </nav>
            </LayoutGroup>
          </div>
        </div>
      </header>

      {/* Original Floating Mobile Bottom Dock + Expanding Inline Dock Search */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none md:hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="relative flex justify-center">
          <motion.div
            animate={{ opacity: mobileSearchOpen ? 0 : 1 }}
            transition={SEARCH_TRANSITION}
            className={mobileSearchOpen ? 'pointer-events-none' : 'pointer-events-auto'}
            aria-hidden={mobileSearchOpen || undefined}
          >
            <nav
              ref={mobileDockRef}
              className="mv-dock-panel"
              role="toolbar"
              aria-label="Main navigation"
            >
              <span aria-hidden="true" className="mv-dock-marker" style={mobileMarkerStyle} />
              {NAV_ITEMS.map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectTab(id)}
                    aria-label={label}
                    aria-pressed={isActive || undefined}
                    data-marker-active={isActive ? 'true' : undefined}
                    className={`mv-dock-item ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}

              <span className="mv-dock-divider" aria-hidden="true" />

              <button
                type="button"
                onClick={onOpenSearch}
                aria-label="Search"
                className="mv-dock-item"
              >
                <SearchIcon size={18} />
              </button>

              <button
                type="button"
                onClick={() => setDownloadsOpen(true)}
                aria-label="Downloads & History"
                className="mv-dock-item"
              >
                <Download className="w-[18px] h-[18px]" />
                {hasActiveDownloads ? (
                  <span className="absolute top-1.5 right-1 px-1 min-w-[16px] h-4 rounded-full bg-[#e50914] text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
                    {overallProgress}%
                  </span>
                ) : (
                  downloads.length > 0 && (
                    <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('watchlist')}
                aria-label="Watchlist"
                aria-pressed={activeTab === 'watchlist' || undefined}
                data-marker-active={activeTab === 'watchlist' ? 'true' : undefined}
                className={`mv-dock-item ${activeTab === 'watchlist' ? 'is-active' : ''}`}
              >
                <Bookmark
                  className={`w-[19px] h-[19px] ${
                    activeTab === 'watchlist' ? 'fill-current' : ''
                  }`}
                />
                {watchlistCount > 0 && (
                  <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-[#e50914]" />
                )}
              </button>
            </nav>
          </motion.div>

          <AnimatePresence>
            {mobileSearchOpen && (
              <motion.div
                key="dock-search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SEARCH_TRANSITION}
                className="pointer-events-auto absolute inset-y-0 left-1/2 w-[min(calc(100vw-32px),420px)] -translate-x-1/2"
              >
                <div
                  ref={mobileDockHostRef}
                  className="header-search-cluster mv-dock-surface relative flex h-full items-center gap-1 p-[3px]"
                >
                  <span className="mv-dock-item !cursor-default" aria-hidden="true">
                    <SearchIcon size={18} />
                  </span>

                  <div className="flex h-11 min-w-0 flex-1 items-center">
                    <HeaderSearch
                      onClose={onCloseSearch}
                      panelHostRef={mobileDockHostRef}
                      panelVisible={true}
                      panelPlacement="above"
                      autoFocusDelay={60}
                      onPlay={onPlayMedia}
                      onSelect={onSelectMedia}
                    />
                  </div>

                  <motion.button
                    type="button"
                    onClick={onCloseSearch}
                    initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    transition={SEARCH_TRANSITION}
                    aria-label="Close search"
                    className="mv-dock-item"
                  >
                    <X size={18} strokeWidth={1.5} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};
