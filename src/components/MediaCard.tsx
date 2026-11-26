import React, { useState } from 'react';
import { Film, Star } from 'lucide-react';
import type { MediaItem } from '@/src/types/media';

interface MediaCardProps {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  rank?: number;
  showEpisodeMeta?: boolean;
  fluid?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onSelect,
  rank,
  showEpisodeMeta = false,
  fluid = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const typeLabel =
    item.mediaType === 'tv' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Movie';

  return (
    <article
      className={`group flex flex-col shrink-0 ${
        fluid ? 'w-full' : 'w-[140px] sm:w-[164px] md:w-[180px] lg:w-[200px]'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-[10px]"
        aria-label={rank ? `#${rank}: ${item.title}` : item.title}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[10px] bg-[#181818] border border-white/[0.06] transition-[border-color,transform] duration-200 group-hover:border-white/[0.22] active:scale-[0.97]">
          {!imgFailed && item.posterUrl ? (
            <img
              src={item.posterUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#181818] p-4 text-center">
              <Film className="w-7 h-7 text-[#6d7787]" aria-hidden="true" />
              <span className="text-xs font-medium text-[#f2f2f2] line-clamp-3">
                {item.title}
              </span>
            </div>
          )}

          {/* Crimson TOP Rank Badge (when in Top 10) */}
          {typeof rank === 'number' && (
            <div
              aria-hidden="true"
              className="absolute left-0 top-0 z-[5] flex flex-col items-center justify-center text-white font-extrabold rounded-br-[6px] w-[30px] h-[36px] pt-[5px] pb-[4px] px-[2px] bg-[#e50914]"
            >
              <span className="text-[8px] leading-none uppercase tracking-[0.08em]">Top</span>
              <span className="text-[13px] leading-none tabular-nums mt-0.5">{rank}</span>
            </div>
          )}

          {/* Episode Badge for Current/Upcoming TV */}
          {showEpisodeMeta && item.episodeCode && (
            <div className="absolute left-2 top-2 z-[5] px-2 py-1 rounded-[4px] bg-[#e50914] text-[10px] font-bold tabular-nums text-white leading-none">
              {item.episodeCode}
            </div>
          )}
        </div>

        {/* Exact Clean Footer Below Poster */}
        <div className="mt-2.5 px-0.5">
          <h3 className="text-[13px] font-medium leading-snug text-[#f2f2f2] line-clamp-1 transition-colors duration-200 group-hover:text-[#ff4651]">
            {item.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8c8c8c] leading-none truncate tabular-nums">
            {item.rating > 0 && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Star className="w-[10px] h-[10px] fill-white text-white" aria-hidden="true" />
                  <span>{item.rating.toFixed(1)}</span>
                </span>
                <span className="text-white/20" aria-hidden="true">
                  ·
                </span>
              </>
            )}
            <span>{item.year}</span>
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            <span className="truncate">{typeLabel}</span>
          </div>
        </div>
      </button>
    </article>
  );
};
