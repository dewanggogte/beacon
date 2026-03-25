import { NextRequest, NextResponse } from 'next/server';
import { getWatchlistCompanies, getLatestRunId } from '../../../lib/queries.js';

export async function POST(request: NextRequest) {
  const { codes } = await request.json();
  const runId = await getLatestRunId();
  if (!runId || !codes?.length) return NextResponse.json([]);
  const data = await getWatchlistCompanies(codes, runId);
  return NextResponse.json(data);
}
