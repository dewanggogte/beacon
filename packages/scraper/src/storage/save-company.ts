import { db, schema } from '@screener/shared';
import { eq } from 'drizzle-orm';
import type { CompanyHeader } from '../company-detail/parse-header.js';

/**
 * Upsert a company record. Returns the company ID.
 */
export async function upsertCompany(
  screenerCode: string,
  header: CompanyHeader,
  screenerUrl?: string,
  entityType?: string,
): Promise<number> {
  // Try to find existing
  const existing = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(eq(schema.companies.screenerCode, screenerCode))
    .limit(1);

  if (existing[0]) {
    // Update
    await db
      .update(schema.companies)
      .set({
        name: header.name,
        bseCode: header.bseCode,
        nseCode: header.nseCode,
        sector: header.sector,
        industry: header.industry,
        website: header.website,
        updatedAt: new Date(),
      })
      .where(eq(schema.companies.id, existing[0].id));
    return existing[0].id;
  }

  // Insert new
  const [inserted] = await db
    .insert(schema.companies)
    .values({
      screenerCode,
      name: header.name,
      bseCode: header.bseCode,
      nseCode: header.nseCode,
      sector: header.sector,
      industry: header.industry,
      website: header.website,
    })
    .returning({ id: schema.companies.id });

  return inserted!.id;
}

/**
 * Bulk insert company list entries (for initial list fetch).
 */
export async function bulkUpsertCompanies(
  entries: { screenerCode: string; name: string; url?: string; entityType?: string }[],
): Promise<void> {
  for (const entry of entries) {
    const existing = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.screenerCode, entry.screenerCode))
      .limit(1);

    if (!existing[0]) {
      await db.insert(schema.companies).values({
        screenerCode: entry.screenerCode,
        name: entry.name,
        screenerUrl: entry.url ?? null,
        entityType: entry.entityType ?? null,
      });
    } else {
      // Update URL and entity type if not already set
      await db
        .update(schema.companies)
        .set({
          screenerUrl: entry.url ?? null,
          entityType: entry.entityType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, existing[0].id));
    }
  }
}
