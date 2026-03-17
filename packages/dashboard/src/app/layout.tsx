import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Beacon — Autonomous Value Research',
  description: 'Autonomous value research for Indian stock markets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <nav className="border-b border-border px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="text-text-primary font-semibold text-xl hover:text-accent-cyan transition-colors">
              Beacon
            </a>
            <div className="flex gap-5 text-sm">
              <a href="/" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Home
              </a>
              <a href="/overview" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Overview
              </a>
              <a href="/rankings" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Rankings
              </a>
              <a href="/conviction" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Conviction
              </a>
              <a href="/frameworks" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Frameworks
              </a>
              <a href="/backtest" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Backtest
              </a>
              <a href="/pipeline" className="text-text-secondary hover:text-accent-cyan transition-colors">
                Pipeline
              </a>
            </div>
          </div>
          <div className="text-text-muted text-xs font-medium tracking-wide uppercase">
            Autonomous Value Research
          </div>
        </nav>
        <main className="p-8">{children}</main>
      </body>
    </html>
  );
}
