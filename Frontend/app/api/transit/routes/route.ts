import { NextResponse } from 'next/server';
import { delhiGtfsService } from '@/lib/delhiGtfsService';

export async function GET() {
  try {
    await delhiGtfsService.initialize();
    const routes = await delhiGtfsService.searchRoutes('');
    return NextResponse.json({ success: true, count: routes.length, routes });
  } catch (error) {
    console.error('Failed to get GTFS routes:', error);
    return NextResponse.json({ success: false, error: 'Failed to get routes' }, { status: 500 });
  }
}
