import { NextRequest, NextResponse } from 'next/server';
import { delhiGtfsService } from '@/lib/delhiGtfsService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const routeId = searchParams.get('route_id') || '729';

    const liveData = await delhiGtfsService.getLiveVehiclePositions(routeId);
    return NextResponse.json({ success: true, routeId, ...liveData });
  } catch (error) {
    console.error('Failed to get live vehicle positions:', error);
    return NextResponse.json({ success: false, error: 'Failed to get live positions' }, { status: 500 });
  }
}
