import { NextRequest, NextResponse } from 'next/server';
import { delhiGtfsService } from '@/lib/delhiGtfsService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '729';
    const hour = parseFloat(searchParams.get('hour') || '9.25');

    const checkInStop = searchParams.get('checkInStop');
    const checkInLevel = searchParams.get('checkInLevel') as 'LOW' | 'MEDIUM' | 'HIGH' | null;

    const userCheckIn =
      checkInStop && checkInLevel
        ? { stopId: checkInStop, level: checkInLevel, timestamp: Date.now() }
        : null;

    const data = await delhiGtfsService.getRouteDetails(id, hour, userCheckIn);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Route not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('Failed to get route details:', error);
    return NextResponse.json({ success: false, error: 'Failed to get route details' }, { status: 500 });
  }
}
