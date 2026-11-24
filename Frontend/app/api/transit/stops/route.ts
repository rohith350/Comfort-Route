import { NextResponse } from 'next/server';
import { delhiGtfsService } from '@/lib/delhiGtfsService';

export async function GET() {
  try {
    const stops = await delhiGtfsService.getAllStops();
    return NextResponse.json({ success: true, count: stops.length, stops });
  } catch (error) {
    console.error('Failed to get stops:', error);
    return NextResponse.json({ success: false, error: 'Failed to get stops' }, { status: 500 });
  }
}
