import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '@screener/shared';
import type { CompanyAnalysis } from '@screener/shared';
import type { WeeklyChange } from '../pipeline/weekly-comparison.js';

/**
 * Generate a markdown weekly report.
 */
export function generateWeeklyReport(
  analyses: CompanyAnalysis[],
  weeklyChanges: WeeklyChange[],
  outputDir?: string,
): string {
  const dir = outputDir ?? resolve(process.cwd(), 'reports');
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const filename = `weekly-report-${date}.md`;
  const filepath = resolve(dir, filename);

  const sorted = [...analyses].sort((a, b) => b.finalScore - a.finalScore);
  const strongLongs = sorted.filter((a) => a.classification === 'strong_long');
  const potentialLongs = sorted.filter((a) => a.classification === 'potential_long');
  const strongAvoids = sorted.filter((a) => a.classification === 'strong_avoid');

  const lines: string[] = [];

  lines.push(`# Weekly Stock Analysis Report — ${date}`);
  lines.push('');

  // Summary
  const counts = {
    strong_long: 0, potential_long: 0, neutral: 0,
    potential_short: 0, strong_avoid: 0,
  };
  for (const a of analyses) { counts[a.classification]++; }

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Classification | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Strong Long | ${counts.strong_long} |`);
  lines.push(`| Potential Long | ${counts.potential_long} |`);
  lines.push(`| Neutral | ${counts.neutral} |`);
  lines.push(`| Potential Short | ${counts.potential_short} |`);
  lines.push(`| Strong Avoid | ${counts.strong_avoid} |`);
  lines.push(`| **Total** | **${analyses.length}** |`);
  lines.push('');

  // Lynch distribution
  const lynchCounts: Record<string, number> = {};
  for (const a of analyses) {
    const cat = a.frameworkResults?.lynch.category ?? 'unknown';
    lynchCounts[cat] = (lynchCounts[cat] ?? 0) + 1;
  }
  lines.push('### Lynch Category Distribution');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|---|---|');
  for (const [cat, count] of Object.entries(lynchCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${cat} | ${count} |`);
  }
  lines.push('');

  // Conviction distribution
  const convCounts: Record<string, number> = {};
  for (const a of analyses) {
    const lvl = a.convictionLevel ?? 'none';
    convCounts[lvl] = (convCounts[lvl] ?? 0) + 1;
  }
  lines.push('### Conviction Distribution');
  lines.push('');
  lines.push('| Level | Count |');
  lines.push('|---|---|');
  for (const [lvl, count] of Object.entries(convCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${lvl} | ${count} |`);
  }
  lines.push('');

  // High Conviction Picks
  const highConviction = sorted.filter((a) => a.convictionLevel === 'high');
  if (highConviction.length > 0) {
    lines.push('## High Conviction Picks');
    lines.push('');
    lines.push('| Rank | Company | Sector | Score | Lynch | Buffett | Graham | Pabrai |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const a of highConviction.slice(0, 20)) {
      const fr = a.frameworkResults;
      lines.push(`| ${a.rank} | ${a.companyName} (${a.screenerCode}) | ${a.sector} | ${a.finalScore} | ${fr?.lynch.category ?? '-'} | ${fr?.buffett.score ?? '-'} | ${fr?.graham.score ?? '-'} | ${fr?.pabrai.riskScore ?? '-'} |`);
    }
    lines.push('');
  }

  // Top 20 Strong Longs
  lines.push('## Top 20 — Strong Long');
  lines.push('');
  lines.push('| Rank | Company | Sector | Score | Lynch | Buffett | Graham | Pabrai | Conviction |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const a of strongLongs.slice(0, 20)) {
    const fr = a.frameworkResults;
    lines.push(`| ${a.rank} | ${a.companyName} (${a.screenerCode}) | ${a.sector} | ${a.finalScore} | ${fr?.lynch.category ?? '-'} | ${fr?.buffett.score ?? '-'} | ${fr?.graham.score ?? '-'} | ${fr?.pabrai.riskScore ?? '-'} | ${a.convictionLevel ?? '-'} |`);
  }
  lines.push('');

  // Top 20 Potential Longs
  if (potentialLongs.length > 0) {
    lines.push('## Top 20 — Potential Long');
    lines.push('');
    lines.push('| Rank | Company | Sector | Score | Lynch | Conviction |');
    lines.push('|---|---|---|---|---|---|');
    for (const a of potentialLongs.slice(0, 20)) {
      lines.push(`| ${a.rank} | ${a.companyName} (${a.screenerCode}) | ${a.sector} | ${a.finalScore} | ${a.frameworkResults?.lynch.category ?? '-'} | ${a.convictionLevel ?? '-'} |`);
    }
    lines.push('');
  }

  // Top Strong Avoids (bottom of the barrel)
  if (strongAvoids.length > 0) {
    lines.push('## Top 10 — Strong Avoid');
    lines.push('');
    lines.push('| Rank | Company | Sector | Score | Reasons |');
    lines.push('|---|---|---|---|---|');
    const bottomAvoids = [...strongAvoids].sort((a, b) => a.finalScore - b.finalScore);
    for (const a of bottomAvoids.slice(0, 10)) {
      const reasons = a.disqualified
        ? a.disqualificationReasons.join('; ')
        : 'Low composite score';
      lines.push(`| ${a.rank} | ${a.companyName} (${a.screenerCode}) | ${a.sector} | ${a.finalScore} | ${reasons} |`);
    }
    lines.push('');
  }

  // Weekly Changes
  if (weeklyChanges.length > 0) {
    const bigMovers = weeklyChanges.filter((c) => Math.abs(c.scoreDelta) >= 5);
    if (bigMovers.length > 0) {
      lines.push('## Biggest Movers (|delta| >= 5)');
      lines.push('');
      lines.push('| Company | Sector | Previous | Current | Delta | Classification |');
      lines.push('|---|---|---|---|---|---|');
      for (const c of bigMovers.slice(0, 20)) {
        const arrow = c.scoreDelta > 0 ? '+' : '';
        const classNote = c.classificationChanged
          ? `${c.previousClassification} -> ${c.currentClassification}`
          : c.currentClassification;
        lines.push(`| ${c.companyName} (${c.screenerCode}) | ${c.sector} | ${c.previousScore.toFixed(1)} | ${c.currentScore.toFixed(1)} | ${arrow}${c.scoreDelta.toFixed(1)} | ${classNote} |`);
      }
      lines.push('');
    }

    const classChanges = weeklyChanges.filter((c) => c.classificationChanged);
    if (classChanges.length > 0) {
      lines.push('## Classification Changes');
      lines.push('');
      lines.push('| Company | Sector | Previous | Current |');
      lines.push('|---|---|---|---|');
      for (const c of classChanges.slice(0, 30)) {
        lines.push(`| ${c.companyName} (${c.screenerCode}) | ${c.sector} | ${c.previousClassification} | ${c.currentClassification} |`);
      }
      lines.push('');
    }
  }

  // Sector distribution
  const sectorCounts = new Map<string, { total: number; longs: number; avoids: number }>();
  for (const a of analyses) {
    const entry = sectorCounts.get(a.sector) ?? { total: 0, longs: 0, avoids: 0 };
    entry.total++;
    if (a.classification === 'strong_long' || a.classification === 'potential_long') entry.longs++;
    if (a.classification === 'strong_avoid') entry.avoids++;
    sectorCounts.set(a.sector, entry);
  }

  lines.push('## Sector Distribution');
  lines.push('');
  lines.push('| Sector | Total | Longs | Avoids |');
  lines.push('|---|---|---|---|');
  const sortedSectors = [...sectorCounts.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [sector, counts2] of sortedSectors) {
    lines.push(`| ${sector} | ${counts2.total} | ${counts2.longs} | ${counts2.avoids} |`);
  }
  lines.push('');

  const content = lines.join('\n');
  writeFileSync(filepath, content);
  logger.info(`Weekly report written to ${filepath}`);
  return filepath;
}
