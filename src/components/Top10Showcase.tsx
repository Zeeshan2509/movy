import React, { useEffect, useState } from 'react';
import { ChevronLeft, Star } from 'lucide-react';
import { HorizontalRail } from '@/src/components/HorizontalRail';
import { MediaCard } from '@/src/components/MediaCard';
import { fetchTmdbDetail } from '@/src/services/api';
import type { MediaItem } from '@/src/types/media';

interface Top10ShowcaseProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
}

export const Top10Showcase: React.FC<Top10ShowcaseProps> = ({ items, onSelect }) => {
  const [trailerOpen, setTrailerOpen] = useState<'mobile' | 'desktop' | null>(null);
  const [leadDetail, setLeadDetail] = useState<MediaItem | null>(null);

  const top10 = items.slice(0, 10);
  const topOne = top10[0];
  const rest = top10.slice(1);

  useEffect(() => {
    setTrailerOpen(null);
    if (!topOne) {
      setLeadDetail(null);
      return;
    }
    setLeadDetail(topOne);

    if (topOne.cast?.length && topOne.videos?.length) return;
    let cancelled = false;
    fetchTmdbDetail(topOne)
      .then((full) => {
        if (!cancelled) setLeadDetail(full);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [topOne]);

  if (!topOne) return null;
  const featured = leadDetail ?? topOne;
  const castLine = featured.cast?.slice(0, 4).map((c) => c.name).join(', ');
  const typeLabel = featured.mediaType === 'tv' ? 'Series' : 'Movie';
  const trailerKey = featured.videos?.[0]?.key ?? null;

  return (
    <section aria-label="TOP 10 on Moviesx" className="layout-container">
      <div className="flex items-start justify-between gap-4 mb-3 md:mb-4">
        <div className="min-w-0">
          <h2 className="text-lg md:text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[#f2f2f2] truncate">
            TOP 10 on Moviesx
          </h2>
        </div>
      </div>

      {/* Mobile Layout: #1 Feature Card + Scrollable #2..#10 Posters */}
      <div className="lg:hidden space-y-3.5">
        <article className="relative overflow-hidden rounded-[10px] border border-white/[0.06] bg-[#181818] p-3 flex flex-col gap-3">
          {featured.backdropUrl && (
            <span className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <img
                src={featured.backdropUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover object-[50%_20%] scale-[1.02]"
              />
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(rgba(15,15,15,0.6) 0%, rgba(15,15,15,0.8) 55%, rgba(15,15,15,0.94) 100%)',
                }}
              />
            </span>
          )}

          {/* Top-right Crimson TOP 1 Badge */}
          <span
            className="absolute top-0 right-0 z-[5] flex flex-col items-center justify-center w-[30px] h-[36px] pt-[5px] pb-[4px] px-[2px] rounded-bl-[6px] bg-[#e50914] text-white font-extrabold"
            aria-hidden="true"
          >
            <span className="text-[8px] leading-none uppercase tracking-[0.08em]">Top</span>
            <span className="text-[13px] leading-none tabular-nums mt-0.5">1</span>
          </span>

          <button
            type="button"
            onClick={() => onSelect(featured)}
            className="relative z-[1] flex items-start gap-3 text-left focus:outline-none"
          >
            <div className="w-[108px] aspect-[2/3] rounded-[10px] overflow-hidden bg-black/35 shrink-0 shadow-lg">
              <img
                src={featured.posterUrl}
                alt={featured.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className="text-[15px] font-semibold leading-[1.3] text-[#f2f2f2] line-clamp-2 pr-9">
                {featured.title}
              </h3>
              <span className="block text-[12px] text-[#b3b3b3] truncate pr-9 tabular-nums">
                {featured.year} · {typeLabel}
              </span>
              {castLine && (
                <span className="block text-[12px] leading-[1.4] text-[#b3b3b3] line-clamp-2">
                  {castLine}
                </span>
              )}
              <p className="text-[12.5px] leading-[1.5] text-white/75 line-clamp-3">
                {featured.description}
              </p>
            </div>
          </button>

          {trailerKey && (
            <button
              type="button"
              onClick={() => setTrailerOpen('mobile')}
              className="mv-btn mv-btn--secondary mv-btn--sm relative z-[1] self-start"
            >
              See trailer
            </button>
          )}

          {/* Sliding Inline Trailer Pane */}
          <div
            className={`absolute inset-0 z-[6] bg-black transition-transform duration-300 ${
              trailerOpen === 'mobile'
                ? 'translate-x-0 pointer-events-auto'
                : 'translate-x-full pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={() => setTrailerOpen(null)}
              aria-label="Close trailer"
              className="mv-icon-btn mv-icon-btn--sm absolute top-2.5 left-2.5 z-[2]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {trailerOpen === 'mobile' && trailerKey && (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`}
                title={`${featured.title} Trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                className="h-full w-full border-0"
              />
            )}
          </div>
        </article>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {rest.map((item, idx) => (
            <div key={item.id} className="w-[140px] sm:w-[160px] shrink-0">
              <MediaCard item={item} fluid rank={idx + 2} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop Layout: Wide #1 Card + #2..#10 Posters inside one Horizontal Rail */}
      <div className="hidden lg:block">
        <HorizontalRail title="" ariaLabel="Top 10 titles" bleed>
          {/* #1 Wide Card (616px) */}
          <div className="group shrink-0 w-[616px]">
            <article className="relative h-[300px] rounded-[10px] border border-white/[0.06] hover:border-white/[0.22] bg-[#181818] overflow-hidden transition-colors duration-200">
              {featured.backdropUrl && (
                <img
                  src={featured.backdropUrl}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover object-[50%_20%] scale-[1.02] group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                />
              )}
              <span
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(15,15,15,0.94) 0%, rgba(15,15,15,0.78) 48%, rgba(15,15,15,0.42) 78%, rgba(15,15,15,0.08) 100%), linear-gradient(transparent 62%, rgba(15,15,15,0.5) 100%)',
                }}
                aria-hidden="true"
              />

              {/* Top-left Crimson TOP 1 Badge */}
              <span
                className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center w-[30px] h-[36px] pt-[5px] pb-[4px] px-[2px] rounded-br-[6px] bg-[#e50914] text-white font-extrabold"
                aria-hidden="true"
              >
                <span className="text-[8px] leading-none uppercase tracking-[0.08em]">Top</span>
                <span className="text-[13px] leading-none tabular-nums mt-0.5">1</span>
              </span>

              <button
                type="button"
                onClick={() => onSelect(featured)}
                className="absolute inset-0 z-[2] flex flex-col justify-end items-start gap-2 pt-4 pr-5 pb-[54px] pl-4 text-left focus:outline-none"
              >
                <div className="max-w-[min(82%,520px)] space-y-2">
                  {featured.logoUrl ? (
                    <img
                      src={featured.logoUrl}
                      alt={featured.title}
                      referrerPolicy="no-referrer"
                      className="max-w-[250px] max-h-[64px] object-contain object-left-bottom"
                    />
                  ) : (
                    <h3 className="text-[21px] font-bold leading-[1.25] text-[#f2f2f2] line-clamp-2">
                      {featured.title}
                    </h3>
                  )}
                  {castLine && (
                    <span className="block text-[12px] text-[#b3b3b3] line-clamp-1">
                      {castLine}
                    </span>
                  )}
                  <p className="text-[12.5px] leading-[1.5] text-white/75 line-clamp-4">
                    {featured.description}
                  </p>
                </div>
              </button>

              {trailerKey && (
                <button
                  type="button"
                  onClick={() => setTrailerOpen('desktop')}
                  className="mv-btn mv-btn--secondary mv-btn--sm absolute bottom-3 left-4 z-[3]"
                >
                  See trailer
                </button>
              )}

              {/* Sliding Inline Trailer Pane */}
              <div
                className={`absolute inset-0 z-[6] bg-black transition-transform duration-300 ${
                  trailerOpen === 'desktop'
                    ? 'translate-x-0 pointer-events-auto'
                    : 'translate-x-full pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setTrailerOpen(null)}
                  aria-label="Close trailer"
                  className="mv-icon-btn mv-icon-btn--sm absolute top-2.5 left-2.5 z-[2]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {trailerOpen === 'desktop' && trailerKey && (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`}
                    title={`${featured.title} Trailer`}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    className="h-full w-full border-0"
                  />
                )}
              </div>
            </article>

            {/* Footer matching exact movy.sx */}
            <button
              type="button"
              onClick={() => onSelect(featured)}
              className="block mt-2.5 px-0.5 text-left w-full focus:outline-none"
            >
              <h3 className="text-[13px] font-medium leading-snug text-[#f2f2f2] line-clamp-1 transition-colors duration-200 group-hover:text-[#ff4651]">
                {featured.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8c8c8c] leading-none truncate tabular-nums">
                {featured.rating > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-[10px] h-[10px] fill-white text-white" aria-hidden="true" />
                    <span>{featured.rating.toFixed(1)}</span>
                  </span>
                )}
                <span className="text-white/20" aria-hidden="true">
                  ·
                </span>
                <span>{featured.year}</span>
                <span className="text-white/20" aria-hidden="true">
                  ·
                </span>
                <span>{typeLabel}</span>
              </div>
            </button>
          </div>

          {/* Ranks #2–#10 */}
          {rest.map((item, idx) => (
            <div key={item.id} className="w-[200px] shrink-0">
              <MediaCard item={item} fluid rank={idx + 2} onSelect={onSelect} />
            </div>
          ))}
        </HorizontalRail>
      </div>
    </section>
  );
};
