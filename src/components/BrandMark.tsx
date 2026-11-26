import React from 'react';
import type { StreamingProviderId } from '@/src/types/media';

export const MoviesxMark: React.FC<{ className?: string }> = ({ className = 'h-7 w-7' }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <defs>
      <clipPath id="moviesx-arch">
        <path d="M0 0h100v100Q50 91.5 0 100Z" />
      </clipPath>
      <linearGradient id="moviesx-dl" x1="11" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#eb0d18" />
        <stop offset="1" stopColor="#d50914" />
      </linearGradient>
      <linearGradient id="moviesx-dr" x1="89" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#b1060f" />
        <stop offset="0.6" stopColor="#8e050d" />
        <stop offset="1" stopColor="#650307" />
      </linearGradient>
    </defs>
    <g clipPath="url(#moviesx-arch)">
      <path fill="#b1060f" d="M0 0h22v100H0z" />
      <path fill="#e50914" d="M78 0h22v100H78z" />
      <path fill="url(#moviesx-dr)" d="M78 0h22L61 100H39z" />
      <path fill="url(#moviesx-dl)" d="M0 0h22l39 100H39z" />
    </g>
  </svg>
);

export const ProviderWordmark: React.FC<{ id: StreamingProviderId; active?: boolean }> = ({
  id,
  active = false,
}) => {
  switch (id) {
    case 'netflix':
      return (
        <span
          className={`font-display text-sm md:text-base font-extrabold tracking-wider uppercase whitespace-nowrap ${
            active ? 'text-[#FF3B44]' : 'text-white/80'
          }`}
        >
          NETFLIX
        </span>
      );
    case 'primevideo':
      return (
        <span
          className={`font-display text-sm md:text-base font-bold tracking-tight whitespace-nowrap ${
            active ? 'text-[#00A8E1]' : 'text-white/80'
          }`}
        >
          prime video
        </span>
      );
    case 'hbomax':
      return (
        <span
          className={`font-display text-sm md:text-base font-extrabold tracking-tight whitespace-nowrap ${
            active ? 'text-[#7C9BFF]' : 'text-white/80'
          }`}
        >
          MAX
        </span>
      );
    case 'disney':
      return (
        <span
          className={`font-display text-sm md:text-base font-extrabold tracking-tight whitespace-nowrap ${
            active ? 'text-[#38BDF8]' : 'text-white/80'
          }`}
        >
          Disney+
        </span>
      );
    case 'appletv':
      return (
        <span
          className={`font-display text-sm md:text-base font-bold tracking-tight whitespace-nowrap ${
            active ? 'text-white' : 'text-white/80'
          }`}
        >
          Apple TV+
        </span>
      );
    case 'paramount':
      return (
        <span
          className={`font-display text-sm md:text-base font-bold tracking-tight whitespace-nowrap ${
            active ? 'text-[#60A5FA]' : 'text-white/80'
          }`}
        >
          Paramount+
        </span>
      );
    case 'hulu':
      return (
        <span
          className={`font-display text-sm md:text-base font-extrabold tracking-wide lowercase whitespace-nowrap ${
            active ? 'text-[#1CE783]' : 'text-white/80'
          }`}
        >
          hulu
        </span>
      );
  }
};
