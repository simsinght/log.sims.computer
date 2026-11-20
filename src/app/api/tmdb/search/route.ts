import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/requireAuth";
import { isConfigured, search, TmdbError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  // Signed-in only (middleware gates first): not an open TMDB proxy.
  const denied = await apiUnauthorized();
  if (denied) return denied;
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "TMDB_API_KEY not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  try {
    const results = await search(query, "tv");
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "TMDB request failed" }, { status: 502 });
  }
}
