// Database audit script - run inside beacon pod via:
// kubectl exec -n beacon <pod> -- node /app/scripts/db-audit.js
// Or copy to pod first, then run

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

(async () => {
  try {
    const latestRun = await sql`SELECT id FROM scrape_runs ORDER BY id DESC LIMIT 1`;
    const rid = latestRun[0].id;

    console.log('=== Q2: LLM Coverage (run ' + rid + ') ===');
    const bySource = await sql`SELECT classification_source, COUNT(*) as cnt FROM analysis_results WHERE scrape_run_id = ${rid} GROUP BY classification_source`;
    console.log('By source:', JSON.stringify(bySource));
    const llm = await sql`
      SELECT
        COUNT(*) FILTER (WHERE llm_synthesis IS NOT NULL) as has_synthesis,
        COUNT(*) FILTER (WHERE llm_fundamentals IS NOT NULL) as has_fundamentals,
        COUNT(*) FILTER (WHERE llm_governance IS NOT NULL) as has_governance,
        COUNT(*) FILTER (WHERE llm_risk IS NOT NULL) as has_risk,
        COUNT(*) as total
      FROM analysis_results WHERE scrape_run_id = ${rid}
    `;
    console.log('LLM:', JSON.stringify(llm));

    console.log('\n=== Q3: Analysis History ===');
    const ah = await sql`SELECT COUNT(*) as cnt FROM analysis_history`;
    console.log('Total rows:', ah[0].cnt);
    const dr = await sql`SELECT COUNT(DISTINCT scrape_run_id) as cnt FROM analysis_history`;
    console.log('Distinct runs:', dr[0].cnt);

    console.log('\n=== Q4: Classification Distribution ===');
    const cd = await sql`SELECT classification, COUNT(*) as cnt FROM analysis_results WHERE scrape_run_id = ${rid} GROUP BY classification ORDER BY cnt DESC`;
    console.log(JSON.stringify(cd, null, 2));

    console.log('\n=== Q5: Orphaned Analysis Results ===');
    const orphans = await sql`SELECT COUNT(*) as cnt FROM analysis_results ar LEFT JOIN scrape_runs sr ON ar.scrape_run_id = sr.id WHERE sr.id IS NULL`;
    console.log('Orphaned:', orphans[0].cnt);

    console.log('\n=== Q6: Metric Completeness ===');
    const mc = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE ar.final_score IS NULL) as null_final_score,
        COUNT(*) FILTER (WHERE ar.composite_score IS NULL) as null_composite_score,
        COUNT(*) FILTER (WHERE ar.piotroski_f_score IS NULL) as null_piotroski,
        COUNT(*) FILTER (WHERE ar.altman_z_score IS NULL) as null_altman,
        COUNT(*) FILTER (WHERE cs.market_cap IS NULL) as null_market_cap
      FROM analysis_results ar
      LEFT JOIN company_snapshots cs ON ar.company_id = cs.company_id AND ar.scrape_run_id = cs.scrape_run_id
      WHERE ar.scrape_run_id = ${rid}
    `;
    console.log(JSON.stringify(mc, null, 2));

    console.log('\n=== Q7: Weekly Changes ===');
    const wc = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE score_change IS NOT NULL) as has_score_change,
        COUNT(*) FILTER (WHERE classification_change IS NOT NULL) as has_classification_change
      FROM analysis_results WHERE scrape_run_id = ${rid}
    `;
    console.log(JSON.stringify(wc));

    console.log('\n=== Q8: Companies Without Analysis ===');
    const missing = await sql`SELECT COUNT(*) as cnt FROM companies c LEFT JOIN analysis_results ar ON c.id = ar.company_id AND ar.scrape_run_id = ${rid} WHERE ar.id IS NULL`;
    console.log('Missing:', missing[0].cnt);
    const total = await sql`SELECT COUNT(*) as cnt FROM companies`;
    console.log('Total companies:', total[0].cnt);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
})();
