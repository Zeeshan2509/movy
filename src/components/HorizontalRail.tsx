import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalRailProps {
  title: React.ReactNode;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  ariaLabel: string;
  bleed?: boolean;
}

export const HorizontalRail: React.FC<HorizontalRailProps> = ({
  title,
  onAction,
  headerExtra,
  children,
  ariaLabel,
  bleed = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(320, Math.round(el.clientWidth * 0.78));
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <section
      aria-label={ariaLabel}
      className={bleed ? 'relative group/row' : 'relative group/row layout-container'}
    >
      {(Boolean(title) || Boolean(headerExtra)) && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-6 mb-3 md:mb-4">
          {title && (
            <div className="min-w-0">
              {onAction ? (
                <button
                  type="button"
                  onClick={onAction}
                  className="group/rowtitle inline-flex max-w-full items-center gap-1 rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white text-[#f2f2f2]"
                >
                  <h2 className="text-lg md:text-[22px] font-semibold leading-tight tracking-[-0.015em] truncate">
                    {title}
                  </h2>
                  <ChevronRight
                    size={22}
                    strokeWidth={2.4}
                    className="shrink-0 text-[#8c8c8c] transition-[transform,color] duration-200 group-hover/rowtitle:translate-x-0.5 group-hover/rowtitle:text-white"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <h2 className="text-lg md:text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[#f2f2f2] truncate">
                  {title}
                </h2>
              )}
            </div>
          )}

          {headerExtra && <div className="shrink-0">{headerExtra}</div>}
        </div>
      )}

      {/* Scrollable Track with Overlay Edge Arrows */}
      <div className="relative">
        <div
          ref={trackRef}
          className="no-scrollbar flex gap-2 md:gap-2.5 overflow-x-auto scroll-smooth pb-1"
        >
          {children}
        </div>

        <button
          type="button"
          onClick={() => scrollByAmount(-1)}
          aria-label={`Scroll ${ariaLabel} backward`}
          className="hidden md:flex items-center justify-center w-12 absolute left-0 top-0 bottom-8 z-10 text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-[#0f0f0f]/80 to-transparent hover:scale-110 focus:outline-none"
        >
          <ChevronLeft size={32} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={() => scrollByAmount(1)}
          aria-label={`Scroll ${ariaLabel} forward`}
          className="hidden md:flex items-center justify-center w-12 absolute right-0 top-0 bottom-8 z-10 text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 bg-gradient-to-l from-[#0f0f0f]/80 to-transparent hover:scale-110 focus:outline-none"
        >
          <ChevronRight size={32} strokeWidth={2.25} />
        </button>
      </div>
    </section>
  );
};
