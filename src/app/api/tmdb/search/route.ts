import { NextRequest, NextResponse } from "next/server";
import { isConfigured, search, SearchType, TmdbError } from "@/lib/tmdb";

function parseType(value: string | null): SearchType {
  if (value === "movie" || value === "tv") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "TMDB_API_KEY not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const type = parseType(searchParams.get("type"));

  try {
    const results = await search(query, type);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "TMDB request failed" }, { status: 502 });
  }
}
