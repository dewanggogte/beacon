import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Screener — Stock Analysis Dashboard',
  description: 'Automated Indian stock market screening and analysis',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-border px-6 py-3 flex items-center justify-between bg-bg-secondary">
          <div className="flex items-center gap-6">
            <a href="/" className="text-accent-cyan font-bold text-lg tracking-wide">
              SCREENER
            </a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-text-secondary hover:text-text-primary transition-colors">
                Home
              </a>
              <a href="/rankings" className="text-text-secondary hover:text-text-primary transition-colors">
                Rankings
              </a>
              <a href="/conviction" className="text-text-secondary hover:text-text-primary transition-colors">
                Conviction
              </a>
              <a href="/frameworks" className="text-text-secondary hover:text-text-primary transition-colors">
                Frameworks
              </a>
              <a href="/backtest" className="text-text-secondary hover:text-text-primary transition-colors">
                Backtest
              </a>
              <a href="/pipeline" className="text-text-secondary hover:text-text-primary transition-colors">
                Pipeline
              </a>
            </div>
          </div>
          <div className="text-text-muted text-xs">
            Value Investing Analytics
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
