import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalRailProps {
  title?: React.ReactNode;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  ariaLabel: string;
  bleed?: boolean;
  insideContainer?: boolean;
  gap?: number;
}

export const HorizontalRail: React.FC<HorizontalRailProps> = ({
  title,
  onAction,
  headerExtra,
  children,
  ariaLabel,
  bleed = true,
  insideContainer = false,
  gap = 8,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const startSentinelRef = useRef<HTMLSpanElement>(null);
  const endSentinelRef = useRef<HTMLSpanElement>(null);
  const didDragRef = useRef(false);

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Original Movy mouse drag-to-scroll with inertia momentum (never traps vertical wheel scroll)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let startX = 0;
    let startScrollLeft = 0;
    let pointerId: number | null = null;
    let moved = false;
    let lastTime = 0;
    let velocity = 0;
    let rafId = 0;

    const cancelInertia = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const clearDragging = () => {
      delete el.dataset.dragging;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      cancelInertia();
      clearDragging();
      didDragRef.current = false;
      pointerId = e.pointerId;
      moved = false;
      startX = e.clientX;
      lastTime = e.timeStamp;
      velocity = 0;
      startScrollLeft = el.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < 6) return;
        moved = true;
        didDragRef.current = true;
        el.dataset.dragging = 'true';
        el.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      const prevLeft = el.scrollLeft;
      el.scrollLeft = startScrollLeft - dx;
      const dt = e.timeStamp - lastTime;
      if (dt > 0) {
        velocity = Math.max(-2.5, Math.min(2.5, (el.scrollLeft - prevLeft) / dt));
      }
      lastTime = e.timeStamp;
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      if (!moved) return;
      moved = false;
      if (e.timeStamp - lastTime > 80) velocity = 0;

      if (Math.abs(velocity) >= 0.1) {
        let prevTime = performance.now();
        const step = (now: number) => {
          const dt = now - prevTime;
          prevTime = now;
          el.scrollLeft += velocity * dt;
          velocity *= Math.pow(0.94, dt / 16);
          const atEdge = el.scrollLeft <= 0 || el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
          if (Math.abs(velocity) < 0.05 || atEdge) {
            clearDragging();
            rafId = 0;
            return;
          }
          rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
      } else {
        clearDragging();
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('dragstart', onDragStart);

    return () => {
      cancelInertia();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('dragstart', onDragStart);
    };
  }, []);

  // Edge sentinel IntersectionObserver for fade scrims & smart Prev/Next buttons
  useEffect(() => {
    const track = trackRef.current;
    const startEl = startSentinelRef.current;
    const endEl = endSentinelRef.current;
    if (!track || !startEl || !endEl || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === startEl) setAtStart(entry.isIntersecting);
          else if (entry.target === endEl) setAtEnd(entry.isIntersecting);
        }
      },
      { root: track, threshold: 0 },
    );
    observer.observe(startEl);
    observer.observe(endEl);
    return () => observer.disconnect();
  }, [children]);

  const scrollPage = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const style = getComputedStyle(el);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const innerW = el.clientWidth - padL - padR;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const curr = el.scrollLeft;
    const trackRectLeft = el.getBoundingClientRect().left;

    const items = Array.from(el.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains('mv-scroll-sentinel'),
    );
    const lefts: number[] = [];
    const widths: number[] = [];
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      lefts.push(rect.left - trackRectLeft + curr - padL);
      widths.push(rect.width);
    }

    let target: number;
    if (direction === 1) {
      const idx = lefts.findIndex((l, i) => l + widths[i] > curr + innerW + 1);
      target = idx >= 0 ? lefts[idx] : maxScroll;
    } else {
      let prevIdx = -1;
      for (let i = lefts.length - 1; i >= 0; i -= 1) {
        if (lefts[i] < curr - 1) {
          prevIdx = i;
          break;
        }
      }
      if (prevIdx < 0) {
        target = 0;
      } else {
        const edge = lefts[prevIdx] + widths[prevIdx] - innerW;
        let firstVis = 0;
        for (let i = 0; i < lefts.length; i += 1) {
          if (lefts[i] <= edge + 1) firstVis = i;
          else break;
        }
        target = lefts[firstVis];
      }
    }

    if (Math.abs(target - curr) < 1) {
      target = curr + direction * innerW;
    }
    el.scrollTo({
      left: Math.min(maxScroll, Math.max(0, target)),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      aria-label={ariaLabel}
      className={insideContainer ? 'relative' : 'relative layout-container'}
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

      {/* Original Movy ScrollRow */}
      <div
        className={`mv-scroll-row ${bleed ? 'mv-scroll-bleed' : ''}`}
        style={{ '--row-gap': `${gap}px` } as React.CSSProperties}
        data-at-start={atStart ? 'true' : 'false'}
        data-at-end={atEnd ? 'true' : 'false'}
      >
        <div
          ref={trackRef}
          className="mv-scroll-track pb-1"
          role="group"
          aria-label={ariaLabel}
          tabIndex={0}
        >
          <span
            ref={startSentinelRef}
            className="mv-scroll-sentinel mv-scroll-sentinel-start"
            aria-hidden="true"
          />
          {children}
          <span
            ref={endSentinelRef}
            className="mv-scroll-sentinel mv-scroll-sentinel-end"
            aria-hidden="true"
          />
        </div>

        <button
          type="button"
          onClick={() => scrollPage(-1)}
          disabled={atStart}
          tabIndex={-1}
          aria-label={`Scroll ${ariaLabel} backward`}
          className="mv-scroll-arrow mv-scroll-arrow-prev focus:outline-none"
        >
          <ChevronLeft size={32} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollPage(1)}
          disabled={atEnd}
          tabIndex={-1}
          aria-label={`Scroll ${ariaLabel} forward`}
          className="mv-scroll-arrow mv-scroll-arrow-next focus:outline-none"
        >
          <ChevronRight size={32} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};
