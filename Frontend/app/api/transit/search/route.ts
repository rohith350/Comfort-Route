import { NextRequest, NextResponse } from 'next/server';
import { delhiGtfsService } from '@/lib/delhiGtfsService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const results = await delhiGtfsService.searchRoutes(query);
    return NextResponse.json({ success: true, query, count: results.length, routes: results });
  } catch (error) {
    console.error('Transit search error:', error);
    return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}
