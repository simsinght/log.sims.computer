import { NextRequest, NextResponse } from "next/server";
import { apiUnauthorized } from "@/lib/requireAuth";
import { getTitle, isConfigured, TmdbError } from "@/lib/tmdb";

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
  const type = searchParams.get("type");
  const id = Number(searchParams.get("id"));

  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const title = await getTitle(type, id);
    return NextResponse.json(title);
  } catch (err) {
    if (err instanceof TmdbError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "TMDB request failed" }, { status: 502 });
  }
}
