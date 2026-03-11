/**
 * Divergence Watcher: Reviews quant-vs-AG4 classification divergences
 * after each pipeline run and emails a report.
 *
 * Identifies patterns in divergences that could improve either the quant model
 * or the LLM prompts.
 */
import { logger } from '@screener/shared';
import { getDivergenceLog, type DivergenceRecord } from './agents/post-validation.js';

const REPORT_EMAIL = 'hello@dewanggogte.com';

interface DivergenceReport {
  timestamp: string;
  totalAg4Evaluated: number;
  totalDivergences: number;
  divergences: DivergenceRecord[];
  patterns: string[];
  recommendations: string[];
}

/**
 * Analyze divergences and generate a structured report.
 */
function buildReport(totalAg4: number): DivergenceReport {
  const divergences = getDivergenceLog();
  const patterns: string[] = [];
  const recommendations: string[] = [];

  if (divergences.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      totalAg4Evaluated: totalAg4,
      totalDivergences: 0,
      divergences: [],
      patterns: ['No significant divergences detected.'],
      recommendations: [],
    };
  }

  // Pattern: AG4 consistently downgrades quant
  const downgrades = divergences.filter((d) => d.ag4Score < d.quantScore);
  const upgrades = divergences.filter((d) => d.ag4Score > d.quantScore);

  if (downgrades.length > upgrades.length * 2) {
    patterns.push(`AG4 downgrades ${downgrades.length}x more than upgrades (${upgrades.length}) — quant model may be systematically optimistic.`);
    recommendations.push('Review quant scoring thresholds — consider tightening strong_long criteria or increasing quality/governance weights.');
  }

  if (upgrades.length > downgrades.length * 2) {
    patterns.push(`AG4 upgrades ${upgrades.length}x more than downgrades (${downgrades.length}) — quant model may be too conservative.`);
    recommendations.push('Review quant disqualification rules — some may be too aggressive for current market conditions.');
  }

  // Pattern: Specific sectors with high divergence
  const sectorDivergences = new Map<string, number>();
  // We don't have sector on DivergenceRecord, but we can count by classification patterns
  const classificationPairs = new Map<string, number>();
  for (const d of divergences) {
    const pair = `${d.quantClassification} → ${d.ag4Classification}`;
    classificationPairs.set(pair, (classificationPairs.get(pair) ?? 0) + 1);
  }

  for (const [pair, count] of classificationPairs) {
    if (count >= 3) {
      patterns.push(`Recurring pattern: ${pair} (${count} companies) — systematic disagreement on this classification transition.`);
    }
  }

  // Pattern: Large score deltas
  const largeDeltas = divergences.filter((d) => Math.abs(d.scoreDelta) >= 30);
  if (largeDeltas.length > 0) {
    patterns.push(`${largeDeltas.length} companies with score delta >= 30 points — extreme disagreement that warrants manual review.`);
    recommendations.push('Manually review these extreme divergences to determine if quant or LLM is more accurate.');
  }

  // Pattern: AG4 frequently overrides high-conviction quant picks
  const highConvictionOverrides = divergences.filter(
    (d) => d.quantClassification === 'strong_long' && d.ag4Classification !== 'strong_long',
  );
  if (highConvictionOverrides.length >= 3) {
    patterns.push(`${highConvictionOverrides.length} strong_long companies downgraded by AG4 — quant may be missing qualitative red flags.`);
    recommendations.push('Add trend-consistency checks to quant model (e.g., penalize strong_long with declining revenue).');
  }

  if (recommendations.length === 0) {
    recommendations.push('Divergence count is within normal range. No immediate action needed.');
  }

  return {
    timestamp: new Date().toISOString(),
    totalAg4Evaluated: totalAg4,
    totalDivergences: divergences.length,
    divergences,
    patterns,
    recommendations,
  };
}

/**
 * Format report as HTML for email.
 */
function formatReportHtml(report: DivergenceReport): string {
  const divergenceRows = report.divergences
    .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta))
    .map((d) => {
      const deltaColor = d.scoreDelta > 0 ? '#00e676' : '#ff1744';
      const deltaSign = d.scoreDelta > 0 ? '+' : '';
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #333">${d.companyName}<br><span style="color:#888;font-size:12px">${d.screenerCode}</span></td>
        <td style="padding:6px 12px;border-bottom:1px solid #333;text-align:center">${d.quantClassification.replace('_', ' ').toUpperCase()}<br><span style="color:#888">${d.quantScore}</span></td>
        <td style="padding:6px 12px;border-bottom:1px solid #333;text-align:center">${d.ag4Classification.replace('_', ' ').toUpperCase()}<br><span style="color:#888">${d.ag4Score}</span></td>
        <td style="padding:6px 12px;border-bottom:1px solid #333;text-align:center;color:${deltaColor}">${deltaSign}${d.scoreDelta} (${d.classificationLevelsApart} levels)</td>
        <td style="padding:6px 12px;border-bottom:1px solid #333;font-size:12px;color:#aaa">${d.ag4Reasoning}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#1a1a2e;color:#e0e0e0;font-family:monospace;padding:20px">
  <h1 style="color:#00e5ff;margin-bottom:4px">Screener Divergence Report</h1>
  <p style="color:#888;margin-top:0">${report.timestamp} | ${report.totalAg4Evaluated} companies evaluated by AG4 | ${report.totalDivergences} divergences</p>

  ${report.totalDivergences === 0 ? '<p style="color:#00e676">No significant divergences detected. Quant and AG4 are well-aligned.</p>' : `
  <h2 style="color:#ffab00;margin-top:24px">Patterns Detected</h2>
  <ul>${report.patterns.map((p) => `<li style="margin-bottom:8px">${p}</li>`).join('')}</ul>

  <h2 style="color:#00e5ff;margin-top:24px">Recommendations</h2>
  <ul>${report.recommendations.map((r) => `<li style="margin-bottom:8px">${r}</li>`).join('')}</ul>

  <h2 style="color:#ff1744;margin-top:24px">Divergence Details</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead>
      <tr style="background:#0d1117">
        <th style="padding:8px 12px;text-align:left;color:#888">Company</th>
        <th style="padding:8px 12px;text-align:center;color:#888">Quant</th>
        <th style="padding:8px 12px;text-align:center;color:#888">AG4</th>
        <th style="padding:8px 12px;text-align:center;color:#888">Delta</th>
        <th style="padding:8px 12px;text-align:left;color:#888">AG4 Reasoning</th>
      </tr>
    </thead>
    <tbody>${divergenceRows}</tbody>
  </table>
  `}
</body>
</html>`;
}

/**
 * Send the divergence report via email.
 * Uses nodemailer if available, falls back to logging the report.
 */
async function sendEmail(html: string, subject: string): Promise<boolean> {
  // Dynamic import to avoid hard dependency on nodemailer
  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser ?? 'screener@localhost';

    if (!smtpHost) {
      logger.warn('SMTP_HOST not configured — writing report to file instead of emailing');
      return false;
    }

    const nodemailer = await import('nodemailer');

    const transport = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    await transport.sendMail({
      from: smtpFrom,
      to: REPORT_EMAIL,
      subject,
      html,
    });

    logger.info(`Divergence report emailed to ${REPORT_EMAIL}`);
    return true;
  } catch (error) {
    logger.warn(`Failed to send email: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Run the divergence watcher after a pipeline run.
 * Generates a report, attempts to email it, and falls back to writing a file.
 */
export async function runDivergenceWatcher(totalAg4Evaluated: number): Promise<void> {
  const report = buildReport(totalAg4Evaluated);

  if (report.totalDivergences === 0) {
    logger.info('Divergence watcher: no significant divergences detected');
    return;
  }

  logger.info(`Divergence watcher: ${report.totalDivergences} divergences found, ${report.patterns.length} patterns detected`);

  const html = formatReportHtml(report);
  const dateStr = new Date().toISOString().slice(0, 10);
  const subject = `[Screener] Divergence Report — ${report.totalDivergences} divergences (${dateStr})`;

  // Try to email
  const emailed = await sendEmail(html, subject);

  // Always write report to file as backup
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const reportsDir = resolve(process.cwd(), 'reports');
  try {
    mkdirSync(reportsDir, { recursive: true });
  } catch { /* ignore */ }

  const filePath = resolve(reportsDir, `divergence-${dateStr}.html`);
  writeFileSync(filePath, html, 'utf-8');
  logger.info(`Divergence report written to ${filePath}`);

  // Also write JSON for programmatic access
  const jsonPath = resolve(reportsDir, `divergence-${dateStr}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  if (!emailed) {
    logger.info('To enable email delivery, set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables');
  }
}
