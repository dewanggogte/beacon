import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ThemeProvider } from '../components/theme-provider.js';
import { WatchlistProvider } from '../components/watchlist-provider.js';
import { DarkModeToggle } from '../components/dark-mode-toggle.js';
import { MobileNav } from '../components/mobile-nav.js';

export const metadata: Metadata = {
  title: 'Beacon — Autonomous Value Research',
  description: 'Autonomous value research for Indian stock markets',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var theme = localStorage.getItem('theme');
            var dark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (dark) document.documentElement.classList.add('dark');
          })();
        ` }} />
      </head>
      <body className="min-h-screen antialiased bg-bg-primary dark:bg-dark-bg-primary text-text-primary dark:text-dark-text-primary">
        <ThemeProvider>
          <WatchlistProvider>
            <nav className="border-b border-border dark:border-dark-border px-8 py-4 flex items-center justify-between bg-bg-primary dark:bg-dark-bg-primary">
              <div className="flex items-center gap-8">
                <Link href="/" className="text-text-primary dark:text-dark-text-primary font-semibold text-xl hover:text-accent-cyan transition-colors">
                  Beacon
                </Link>
                <div className="hidden md:flex gap-5 text-sm">
                  <Link href="/" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Home
                  </Link>
                  <Link href="/overview" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Overview
                  </Link>
                  <Link href="/rankings" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Rankings
                  </Link>
                  <Link href="/explore" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Explore
                  </Link>
                  <Link href="/pipeline" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Pipeline
                  </Link>
                  <Link href="/watchlist" className="text-text-secondary dark:text-dark-text-secondary hover:text-accent-cyan dark:hover:text-accent-cyan transition-colors">
                    Watchlist
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-text-muted dark:text-dark-text-muted text-xs font-medium tracking-wide uppercase">
                  Autonomous Value Research
                </div>
                <div className="hidden md:block">
                  <DarkModeToggle />
                </div>
                <MobileNav />
              </div>
            </nav>
            <main className="p-8">{children}</main>
          </WatchlistProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
