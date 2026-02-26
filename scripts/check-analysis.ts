import { db, schema } from '@screener/shared';

const results = await db.select().from(schema.analysisResults);
for (const r of results) {
  console.log(JSON.stringify({
    companyId: r.companyId,
    composite: r.compositeScore,
    final: r.finalScore,
    classification: r.classification,
    rank: r.rankOverall,
    val: r.valuationScore,
    qual: r.qualityScore,
    gov: r.governanceScore,
    safety: r.safetyScore,
    mom: r.momentumScore,
  }));
}
process.exit(0);
