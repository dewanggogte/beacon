'use client';

import { useWatchlist } from './watchlist-provider';

interface WatchlistButtonProps {
  code: string;
  size?: 'sm' | 'md';
}

export function WatchlistButton({ code, size = 'md' }: WatchlistButtonProps) {
  const { toggle, isWatched } = useWatchlist();
  const watched = isWatched(code);

  const sizeClass = size === 'sm' ? 'text-sm p-1' : 'text-base p-1.5';

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle(code);
  }

  return (
    <button
      onClick={handleClick}
      aria-label={watched ? `Remove ${code} from watchlist` : `Add ${code} to watchlist`}
      title={watched ? `Remove ${code} from watchlist` : `Add ${code} to watchlist`}
      className={`rounded transition-colors hover:text-accent-amber ${sizeClass} ${
        watched
          ? 'text-accent-amber'
          : 'text-text-muted dark:text-dark-text-muted'
      }`}
    >
      {watched ? '★' : '☆'}
    </button>
  );
}
