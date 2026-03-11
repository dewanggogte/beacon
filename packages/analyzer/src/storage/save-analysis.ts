import { db, schema } from '@screener/shared';
import type { CompanyAnalysis } from '@screener/shared';

/**
 * Save all analysis results to the database.
 */
export async function saveAnalysisResults(
  scrapeRunId: number,
  analyses: CompanyAnalysis[],
): Promise<void> {
  for (const analysis of analyses) {
    const valuation = analysis.dimensionScores.find((d) => d.dimension === 'valuation');
    const quality = analysis.dimensionScores.find((d) => d.dimension === 'quality');
    const governance = analysis.dimensionScores.find((d) => d.dimension === 'governance');
    const safety = analysis.dimensionScores.find((d) => d.dimension === 'safety');
    const momentum = analysis.dimensionScores.find((d) => d.dimension === 'momentum');

    const fr = analysis.frameworkResults;

    const values = {
      companyId: analysis.companyId,
      scrapeRunId,
      valuationScore: valuation?.score.toString() ?? null,
      qualityScore: quality?.score.toString() ?? null,
      governanceScore: governance?.score.toString() ?? null,
      safetyScore: safety?.score.toString() ?? null,
      momentumScore: momentum?.score.toString() ?? null,
      compositeScore: analysis.compositeScore.toString(),
      disqualified: analysis.disqualified,
      disqualificationReasons: analysis.disqualificationReasons,
      metricDetails: analysis.dimensionScores,
      llmAnalysis: analysis.llmAnalysis ?? null,
      llmAdjustment: analysis.llmAnalysis?.qualitativeAdjustment?.toString() ?? null,
      finalScore: analysis.finalScore.toString(),
      classification: analysis.classification,
      rankOverall: analysis.rank,
      rankInSector: analysis.rankInSector,
      // Framework columns
      buffettScore: fr?.buffett.score.toString() ?? null,
      grahamScore: fr?.graham.score.toString() ?? null,
      pabraiRiskScore: fr?.pabrai.riskScore.toString() ?? null,
      lynchCategoryScore: fr?.lynch.categoryScore.toString() ?? null,
      lynchClassification: fr?.lynch.category ?? null,
      frameworkDetails: fr ?? null,
      convictionLevel: analysis.convictionLevel ?? null,
      convictionReasons: analysis.convictionReasons ?? null,
      // Dual evaluation attribution (v2.2)
      quantClassification: analysis.quantClassification ?? analysis.classification,
      quantConvictionLevel: analysis.quantConvictionLevel ?? analysis.convictionLevel ?? null,
      classificationSource: analysis.classificationSource ?? 'quant',
    };

    await db
      .insert(schema.analysisResults)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.analysisResults.companyId, schema.analysisResults.scrapeRunId],
        set: {
          ...values,
          analyzedAt: new Date(),
        },
      });
  }
}
