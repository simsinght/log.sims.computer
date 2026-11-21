import { NextResponse } from 'next/server';
import { storageMode } from '@/lib/durableStore';

export const runtime = 'nodejs';

export interface HealthCheckResponse {
  ok: boolean;
  // "durable" when sign-ins are written to TVLOG_DATA_DIR and survive a
  // restart; "memory" when they don't (unset, or the directory isn't writable).
  sessions: 'durable' | 'memory';
}

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  return NextResponse.json(
    { ok: true, sessions: storageMode() },
    { status: 200 },
  );
}
