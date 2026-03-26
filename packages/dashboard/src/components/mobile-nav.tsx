'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { DarkModeToggle } from './dark-mode-toggle.js';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Overview', href: '/overview' },
  { label: 'Rankings', href: '/rankings' },
  { label: 'Explore', href: '/explore' },
  { label: 'Pipeline', href: '/pipeline' },
  { label: 'Watchlist', href: '/watchlist' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    // Focus first link
    const firstLink = panel.querySelector('a, button') as HTMLElement;
    firstLink?.focus();

    // Trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;

      const focusable = panel.querySelectorAll('a, button, input, [tabindex]');
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="rounded-md p-1.5 text-text-primary dark:text-dark-text-primary transition-colors hover:bg-bg-hover dark:hover:bg-dark-bg-hover"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className={`fixed right-0 top-0 z-50 flex h-full w-64 flex-col bg-bg-card dark:bg-dark-bg-card border-l border-border dark:border-dark-border shadow-xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-border dark:border-dark-border px-4 py-4">
          <span className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
            Beacon
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-md p-1.5 text-text-primary dark:text-dark-text-primary transition-colors hover:bg-bg-hover dark:hover:bg-dark-bg-hover"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <ul className="space-y-1">
            {NAV_LINKS.map(({ label, href }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-bg-secondary dark:bg-dark-bg-secondary text-text-primary dark:text-dark-text-primary'
                        : 'text-text-secondary dark:text-dark-text-secondary hover:bg-bg-hover dark:hover:bg-dark-bg-hover hover:text-text-primary dark:hover:text-dark-text-primary'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Dark mode toggle */}
        <div className="border-t border-border dark:border-dark-border px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
              Theme
            </span>
            <DarkModeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
