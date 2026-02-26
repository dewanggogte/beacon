import { db, schema, logger } from '@screener/shared';
import type { CompanyAnalysis } from '@screener/shared';
import { eq, desc, ne } from 'drizzle-orm';

export interface WeeklyChange {
  companyName: string;
  screenerCode: string;
  sector: string;
  previousScore: number;
  currentScore: number;
  scoreDelta: number;
  previousClassification: string;
  currentClassification: string;
  classificationChanged: boolean;
}

/**
 * Compare current analysis results with the previous run's results.
 */
export async function computeWeeklyChanges(
  currentRunId: number,
  analyses: CompanyAnalysis[],
): Promise<WeeklyChange[]> {
  // Find the previous run
  const previousRuns = await db
    .select()
    .from(schema.scrapeRuns)
    .where(ne(schema.scrapeRuns.id, currentRunId))
    .orderBy(desc(schema.scrapeRuns.startedAt))
    .limit(1);

  if (previousRuns.length === 0) {
    logger.info('No previous run found — skipping weekly comparison');
    return [];
  }

  const previousRunId = previousRuns[0]!.id;
  logger.info(`Comparing run #${currentRunId} with previous run #${previousRunId}`);

  // Load previous analysis results
  const previousResults = await db
    .select()
    .from(schema.analysisResults)
    .where(eq(schema.analysisResults.scrapeRunId, previousRunId));

  const previousMap = new Map<number, typeof previousResults[0]>();
  for (const r of previousResults) {
    previousMap.set(r.companyId, r);
  }

  const changes: WeeklyChange[] = [];

  for (const analysis of analyses) {
    const prev = previousMap.get(analysis.companyId);
    if (!prev) continue;

    const previousScore = Number(prev.finalScore ?? prev.compositeScore ?? 0);
    const scoreDelta = analysis.finalScore - previousScore;
    const previousClassification = String(prev.classification ?? 'neutral');

    changes.push({
      companyName: analysis.companyName,
      screenerCode: analysis.screenerCode,
      sector: analysis.sector,
      previousScore,
      currentScore: analysis.finalScore,
      scoreDelta,
      previousClassification,
      currentClassification: analysis.classification,
      classificationChanged: previousClassification !== analysis.classification,
    });
  }

  // Sort by absolute delta (biggest movers first)
  changes.sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));

  const classChanges = changes.filter((c) => c.classificationChanged);
  logger.info(
    `Weekly changes: ${changes.length} companies compared, ` +
    `${classChanges.length} classification changes`,
  );

  // Update score_change and classification_change in analysis_results
  for (const change of changes) {
    const analysis = analyses.find((a) => a.screenerCode === change.screenerCode);
    if (!analysis) continue;

    await db
      .update(schema.analysisResults)
      .set({
        scoreChange: change.scoreDelta.toString(),
        classificationChange: change.classificationChanged
          ? `${change.previousClassification} → ${change.currentClassification}`
          : null,
      })
      .where(eq(schema.analysisResults.companyId, analysis.companyId));
  }

  return changes;
}
