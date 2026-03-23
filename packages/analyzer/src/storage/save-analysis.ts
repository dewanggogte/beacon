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
      // v3 financial health scores
      piotroskiFScore: analysis.piotroskiFScore ?? null,
      altmanZScore: analysis.altmanZScore != null ? String(analysis.altmanZScore) : null,
      beneishMScore: analysis.beneishMScore != null ? String(analysis.beneishMScore) : null,
      gateResults: analysis.gateResults ?? null,
    };

    await db
      .insert(schema.analysisResults)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.analysisResults.companyId, schema.analysisResults.scrapeRunId],
        set: {
          // Always update quant scores
          valuationScore: values.valuationScore,
          qualityScore: values.qualityScore,
          governanceScore: values.governanceScore,
          safetyScore: values.safetyScore,
          momentumScore: values.momentumScore,
          compositeScore: values.compositeScore,
          disqualified: values.disqualified,
          disqualificationReasons: values.disqualificationReasons,
          metricDetails: values.metricDetails,
          finalScore: values.finalScore,
          classification: values.classification,
          rankOverall: values.rankOverall,
          rankInSector: values.rankInSector,
          buffettScore: values.buffettScore,
          grahamScore: values.grahamScore,
          pabraiRiskScore: values.pabraiRiskScore,
          lynchCategoryScore: values.lynchCategoryScore,
          lynchClassification: values.lynchClassification,
          frameworkDetails: values.frameworkDetails,
          convictionLevel: values.convictionLevel,
          convictionReasons: values.convictionReasons,
          quantClassification: values.quantClassification,
          quantConvictionLevel: values.quantConvictionLevel,
          piotroskiFScore: values.piotroskiFScore,
          altmanZScore: values.altmanZScore,
          beneishMScore: values.beneishMScore,
          gateResults: values.gateResults,
          analyzedAt: new Date(),
          // LLM fields: only overwrite if new values are non-null (preserve existing LLM data)
          ...(values.llmAnalysis != null ? { llmAnalysis: values.llmAnalysis } : {}),
          ...(values.llmAdjustment != null ? { llmAdjustment: values.llmAdjustment } : {}),
          ...(values.classificationSource !== 'quant' ? { classificationSource: values.classificationSource } : {}),
        },
      });
  }
}
