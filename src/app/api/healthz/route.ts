import { NextResponse } from 'next/server';

export interface HealthCheckResponse {
  ok: boolean;
}

export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  return NextResponse.json({ ok: true }, { status: 200 });
}
