import React, { useEffect, useState } from 'react';
import { Info, Star } from 'lucide-react';
import type { MediaItem } from '@/src/types/media';

interface HeroBillboardProps {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
  paused?: boolean;
}

export const HeroBillboard: React.FC<HeroBillboardProps> = ({
  items,
  onPlay,
  onMoreInfo,
  paused = false,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgErrorIds, setImgErrorIds] = useState<Record<string, boolean>>({});
  const [logoErrorIds, setLogoErrorIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  const current = items[activeIndex] ?? items[0];
  if (!current) return null;

  const rankNum = activeIndex + 1;
  const typeLabel =
    current.mediaType === 'tv' ? 'Series' : current.mediaType === 'anime' ? 'Anime' : 'Movie';
  const runtimeLabel = current.runtime
    ? `${Math.floor(current.runtime / 60)}h ${current.runtime % 60}m`
    : current.seasons
      ? `${current.seasons} ${current.seasons === 1 ? 'Season' : 'Seasons'}`
      : null;

  return (
    <div className="relative">
      <section
        className="relative w-full h-[70vh] min-h-[420px] md:h-[85vh] bg-[#0f0f0f] overflow-hidden select-none flex items-end"
        aria-label={`Featured: ${current.title}`}
        aria-roledescription="carousel"
      >
        {/* Full-Bleed Masked Backdrop */}
        <div className="hero-backdrop-wrap">
          {!imgErrorIds[current.id] && current.backdropUrl ? (
            <img
              key={current.id}
              src={current.backdropUrl}
              alt={current.title}
              referrerPolicy="no-referrer"
              onError={() => setImgErrorIds((prev) => ({ ...prev, [current.id]: true }))}
              className="h-full w-full object-cover object-[50%_28%] md:object-center transition-opacity duration-500"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#181818] via-[#121212] to-[#0f0f0f]" />
          )}
        </div>

        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-seam-fade" aria-hidden="true" />

        {/* Foreground Content Stack */}
        <div className="relative z-[5] w-full pb-[11vh] md:pb-[14vh] pt-20">
          <div className="layout-container w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="min-w-0 max-w-[560px] text-left">
                {/* Logo or Title */}
                <div className="min-h-[40px] md:min-h-[56px]">
                  {current.logoUrl && !logoErrorIds[current.id] ? (
                    <div className="w-[min(340px,70vw)] md:w-[min(420px,36vw)] h-[90px] md:h-[128px] relative">
                      <img
                        src={current.logoUrl}
                        alt={current.title}
                        referrerPolicy="no-referrer"
                        onError={() => setLogoErrorIds((prev) => ({ ...prev, [current.id]: true }))}
                        className="h-full w-full object-contain object-left-bottom drop-shadow-[0_10px_28px_rgba(0,0,0,0.6)]"
                      />
                    </div>
                  ) : (
                    <h1 className="font-display text-4xl md:text-[3.5rem] font-bold tracking-[-0.035em] leading-none text-white [text-wrap:balance] drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                      {current.title}
                    </h1>
                  )}
                </div>

                {/* Original Crimson TOP 10 Signal Callout */}
                <div className="mt-3.5 md:mt-[18px] flex items-center min-h-[24px]">
                  <span className="inline-flex items-center gap-2.5 text-[15px] md:text-[17px] font-semibold leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                    <span
                      className="inline-flex flex-col items-center justify-center w-6 h-6 md:w-[26px] md:h-[26px] rounded-[3px] bg-[#e50914] text-white font-extrabold leading-[0.92] shrink-0"
                      aria-hidden="true"
                    >
                      <span className="text-[7px] tracking-[0.06em]">TOP</span>
                      <span className="text-[12px] md:text-[13px] tracking-[-0.02em]">10</span>
                    </span>
                    <span>
                      #{rankNum} in {current.mediaType === 'tv' ? 'TV shows' : 'movies'}
                    </span>
                  </span>
                </div>

                {/* Dot-separated Facts */}
                <div className="mt-3.5 md:mt-[18px] flex flex-wrap items-center gap-y-2 text-[14px] md:text-[15px] font-medium leading-[1.2] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] tabular-nums">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Star
                      className="w-[13px] h-[13px] text-[#e50914] fill-[#e50914]"
                      aria-hidden="true"
                    />
                    <span>{current.rating.toFixed(1)}</span>
                  </span>
                  <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" aria-hidden="true" />
                  <span>{current.year}</span>
                  {runtimeLabel && (
                    <>
                      <span
                        className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5"
                        aria-hidden="true"
                      />
                      <span>{runtimeLabel}</span>
                    </>
                  )}
                  <span className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5" aria-hidden="true" />
                  <span>{typeLabel}</span>
                  {current.certification && (
                    <>
                      <span
                        className="w-[3px] h-[3px] rounded-full bg-white/50 mx-2.5"
                        aria-hidden="true"
                      />
                      <span className="mv-age-badge">{current.certification}</span>
                    </>
                  )}
                </div>

                {/* Dot-separated Genres */}
                <p className="mt-2 md:mt-2.5 flex flex-wrap items-center text-[13px] md:text-[14px] font-medium leading-[1.2] text-white/75">
                  {current.genres.slice(0, 3).map((genre, idx) => (
                    <React.Fragment key={genre}>
                      {idx > 0 && (
                        <span
                          className="w-[3px] h-[3px] rounded-full bg-white/40 mx-[9px]"
                          aria-hidden="true"
                        />
                      )}
                      <span>{genre}</span>
                    </React.Fragment>
                  ))}
                </p>

                {/* Description */}
                <p className="mt-3.5 md:mt-4 max-w-[34rem] text-[15px] md:text-[16px] font-medium leading-[1.5] md:leading-[1.55] text-white line-clamp-3 drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]">
                  {current.description}
                </p>

                {/* Exact .mv-btn Primary + Secondary CTA Row */}
                <div className="mt-5 md:mt-6 flex items-center gap-2.5 md:gap-3">
                  <button
                    type="button"
                    onClick={() => onPlay(current)}
                    className="mv-btn mv-btn--primary"
                  >
                    <svg
                      className="h-[22px] w-[22px] md:h-6 md:w-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M7 4.87v14.26c0 .8.87 1.28 1.54.85l11.2-7.13a1 1 0 0 0 0-1.7L8.54 4.02C7.87 3.6 7 4.07 7 4.87Z" />
                    </svg>
                    <span>Play</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onMoreInfo(current)}
                    className="mv-btn mv-btn--secondary"
                  >
                    <Info className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                    <span>More info</span>
                  </button>
                </div>
              </div>

              {/* Bottom-Right Thin Slide Markers */}
              {items.length > 1 && (
                <div
                  className="flex items-center justify-end self-start md:self-end shrink-0"
                  role="tablist"
                  aria-label="Featured titles"
                >
                  {items.map((item, idx) => {
                    const isSelected = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-label={item.title}
                        onClick={() => setActiveIndex(idx)}
                        className={`relative h-6 bg-transparent border-0 rounded transition-[width] duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                          isSelected ? 'w-[46px]' : 'w-6'
                        }`}
                      >
                        <span
                          className={`absolute left-[5px] right-[5px] top-1/2 -translate-y-1/2 h-[3px] rounded-full transition-colors duration-200 ${
                            isSelected ? 'bg-white' : 'bg-white/30 hover:bg-white/60'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
