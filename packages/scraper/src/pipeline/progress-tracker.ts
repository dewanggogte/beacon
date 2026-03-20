import { db, schema } from '@screener/shared';
import { eq, and, isNotNull } from 'drizzle-orm';

export interface CompanyToScrape {
  screenerCode: string;
  screenerUrl: string | null;
  entityType: string | null;
}

/**
 * Get companies that have NOT been scraped in the given run (with URL + entity info).
 */
export async function getUnscrapedCompanies(scrapeRunId: number): Promise<CompanyToScrape[]> {
  const allCompanies = await db
    .select({
      screenerCode: schema.companies.screenerCode,
      screenerUrl: schema.companies.screenerUrl,
      entityType: schema.companies.entityType,
    })
    .from(schema.companies);

  const scraped = await db
    .select({ screenerCode: schema.companies.screenerCode })
    .from(schema.companySnapshots)
    .innerJoin(schema.companies, eq(schema.companySnapshots.companyId, schema.companies.id))
    .where(eq(schema.companySnapshots.scrapeRunId, scrapeRunId));

  const scrapedSet = new Set(scraped.map((s) => s.screenerCode));
  return allCompanies.filter((c) => !scrapedSet.has(c.screenerCode));
}

/**
 * Get the list of company screener codes that have NOT been scraped in the given run.
 * @deprecated Use getUnscrapedCompanies instead
 */
export async function getUnscrapedCompanyCodes(scrapeRunId: number): Promise<string[]> {
  const companies = await getUnscrapedCompanies(scrapeRunId);
  return companies.map((c) => c.screenerCode);
}

/**
 * Get total company count in the database.
 */
export async function getCompanyCount(): Promise<number> {
  const result = await db
    .select({ screenerCode: schema.companies.screenerCode })
    .from(schema.companies);
  return result.length;
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}
