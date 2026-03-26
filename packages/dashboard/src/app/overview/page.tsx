import { getPipelineStatus } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function ScrapeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ScoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" rx="0.5" />
      <rect x="10" y="7" width="4" height="14" rx="0.5" />
      <rect x="17" y="3" width="4" height="18" rx="0.5" />
    </svg>
  );
}

function AnalyzeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
      <path d="M9 11.5V14l-4 3v2h14v-2l-4-3v-2.5" />
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PresentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <polyline points="7 10 10 8 13 11 17 7" />
    </svg>
  );
}

const stages = [
  { icon: ScrapeIcon, name: 'Scrape', color: 'text-accent-cyan' },
  { icon: ScoreIcon, name: 'Score', color: 'text-accent-blue' },
  { icon: AnalyzeIcon, name: 'Analyze', color: 'text-accent-amber' },
  { icon: PresentIcon, name: 'Present', color: 'text-accent-green' },
];

export default async function OverviewPage() {
  const pipeline = await getPipelineStatus();

  const funnelSteps = [
    { label: `${pipeline.totalCompanies.toLocaleString('en-IN')} companies scraped from Screener.in`, width: '100%' },
    { label: `${pipeline.analyzedCompanies.toLocaleString('en-IN')} scored & analyzed (Layer 1 quantitative)`, width: '66%' },
    { label: 'Top companies enter LLM pipeline', width: '40%' },
    { label: 'Full AG1–AG4 analysis', width: '22%' },
    { label: 'High conviction picks', width: '10%' },
  ];

  const lastRun = pipeline.latestRun;
  const statusColor = lastRun?.status === 'completed'
    ? 'text-accent-green'
    : lastRun?.status === 'running'
      ? 'text-accent-amber'
      : 'text-accent-red';

  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">How It Works</h1>
        <p className="text-text-secondary dark:text-dark-text-secondary">
          From raw data to investment intelligence in four stages
        </p>
      </div>

      {/* Pipeline Flow */}
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Scrape */}
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5 flex gap-5">
          <div className="text-accent-cyan shrink-0 pt-0.5"><ScrapeIcon className="w-7 h-7" /></div>
          <div>
            <div className="font-semibold text-accent-cyan mb-1">Scrape</div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              Crawls Screener.in for {pipeline.totalCompanies.toLocaleString()}+ companies &mdash; financials,
              ratios, shareholding, and pros/cons going back ~13 years.
            </p>
          </div>
        </div>

        <div className="flex justify-center text-text-muted dark:text-dark-text-muted">&darr;</div>

        {/* Score */}
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5 flex gap-5">
          <div className="text-accent-blue shrink-0 pt-0.5"><ScoreIcon className="w-7 h-7" /></div>
          <div>
            <div className="font-semibold text-accent-blue mb-1">Score</div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
              21 metrics across five weighted dimensions, sector-adjusted:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 text-sm mb-2">
              <div><span className="text-text-secondary dark:text-dark-text-secondary">Quality 30%</span> <span className="text-text-muted dark:text-dark-text-muted">&mdash; ROE, growth, cash conversion</span></div>
              <div><span className="text-text-secondary dark:text-dark-text-secondary">Valuation 25%</span> <span className="text-text-muted dark:text-dark-text-muted">&mdash; PE, PB, earnings yield</span></div>
              <div><span className="text-text-secondary dark:text-dark-text-secondary">Governance 20%</span> <span className="text-text-muted dark:text-dark-text-muted">&mdash; promoter holding, pledging</span></div>
              <div><span className="text-text-secondary dark:text-dark-text-secondary">Safety 15%</span> <span className="text-text-muted dark:text-dark-text-muted">&mdash; debt/equity, interest cover</span></div>
              <div><span className="text-text-secondary dark:text-dark-text-secondary">Momentum 10%</span> <span className="text-text-muted dark:text-dark-text-muted">&mdash; price trend, delivery vol</span></div>
            </div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              Buffett, Graham, Lynch, and Pabrai frameworks blended into a composite.
              8 disqualification rules filter red flags.
            </p>
          </div>
        </div>

        <div className="flex justify-center text-text-muted dark:text-dark-text-muted">&darr;</div>

        {/* Analyze */}
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5 flex gap-5">
          <div className="text-accent-amber shrink-0 pt-0.5"><AnalyzeIcon className="w-7 h-7" /></div>
          <div>
            <div className="font-semibold text-accent-amber mb-1">Analyze</div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-2">
              Top ~600 companies enter a four-agent LLM pipeline; ~200 get the full pass:
            </p>
            <div className="space-y-0.5 text-sm">
              <div><span className="text-text-primary dark:text-dark-text-primary font-medium">AG1</span> <span className="text-text-muted dark:text-dark-text-muted">Fundamentals &mdash; earnings quality, growth, balance sheet</span></div>
              <div><span className="text-text-primary dark:text-dark-text-primary font-medium">AG2</span> <span className="text-text-muted dark:text-dark-text-muted">Governance &mdash; promoter behaviour, capital allocation</span></div>
              <div><span className="text-text-primary dark:text-dark-text-primary font-medium">AG3</span> <span className="text-text-muted dark:text-dark-text-muted">Risk &mdash; concentration, regulatory, cyclical exposure</span></div>
              <div><span className="text-text-primary dark:text-dark-text-primary font-medium">AG4</span> <span className="text-text-muted dark:text-dark-text-muted">Synthesis &mdash; final classification + thesis, can override quant</span></div>
            </div>
          </div>
        </div>

        <div className="flex justify-center text-text-muted dark:text-dark-text-muted">&darr;</div>

        {/* Present */}
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5 flex gap-5">
          <div className="text-accent-green shrink-0 pt-0.5"><PresentIcon className="w-7 h-7" /></div>
          <div>
            <div className="font-semibold text-accent-green mb-1">Present</div>
            <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              Seven views &mdash; home, rankings, conviction, frameworks, company deep-dives,
              backtesting, and pipeline status &mdash; updating after each run.
            </p>
          </div>
        </div>
      </div>

      {/* Tiering Funnel */}
      <div>
        <h2 className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider mb-4">Analysis Funnel</h2>
        <div className="space-y-2">
          {funnelSteps.map((step) => (
            <div key={step.label} className="flex items-center gap-4">
              <div
                className="h-8 bg-accent-cyan/15 border border-accent-cyan/30 rounded"
                style={{ width: step.width, minWidth: '2rem' }}
              />
              <div className="text-sm text-text-secondary dark:text-dark-text-secondary whitespace-nowrap">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Last Run Status */}
      {lastRun && (
        <div>
          <h2 className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider mb-4">Last Pipeline Run</h2>
          <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-text-muted dark:text-dark-text-muted">Run ID:</span>{' '}
                <span className="text-text-primary dark:text-dark-text-primary font-medium">{lastRun.id}</span>
              </div>
              <div>
                <span className="text-text-muted dark:text-dark-text-muted">Status:</span>{' '}
                <span className={`font-medium ${statusColor}`}>{lastRun.status}</span>
              </div>
              <div>
                <span className="text-text-muted dark:text-dark-text-muted">Started:</span>{' '}
                <span className="text-text-primary dark:text-dark-text-primary">
                  {lastRun.startedAt ? new Date(lastRun.startedAt).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
              </div>
              <div>
                <span className="text-text-muted dark:text-dark-text-muted">Analyzed:</span>{' '}
                <span className="text-text-primary dark:text-dark-text-primary">{pipeline.analyzedCompanies} companies</span>
              </div>
            </div>
            <a
              href="/pipeline"
              className="inline-block mt-3 text-accent-cyan text-sm hover:underline"
            >
              View full pipeline details &rarr;
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
