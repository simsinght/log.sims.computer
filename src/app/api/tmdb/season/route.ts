import { NextRequest, NextResponse } from "next/server";
import { getSeasonEpisodes, isConfigured, TmdbError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "TMDB_API_KEY not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const show = Number(searchParams.get("show"));
  const season = Number(searchParams.get("season"));

  if (!Number.isInteger(show) || show <= 0) {
    return NextResponse.json({ error: "Invalid show" }, { status: 400 });
  }
  if (!Number.isInteger(season) || season < 0) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  try {
    const episodes = await getSeasonEpisodes(show, season);
    return NextResponse.json({ episodes });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "TMDB request failed" }, { status: 502 });
  }
}
