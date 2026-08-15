import type { DiaryDay, DiaryEntry } from "@/lib/diary";

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function EntryRow({ entry }: { entry: DiaryEntry }) {
  return (
    <div className="border-l-2 border-gray-800 py-3 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{entry.title}</span>
        {entry.year && (
          <span className="text-sm text-gray-500">{entry.year}</span>
        )}
        {entry.season !== undefined && (
          <span className="text-sm text-gray-400">
            S{entry.season}
            {entry.episode !== undefined ? `E${entry.episode}` : ""}
          </span>
        )}
        {entry.rewatch && (
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Rewatch
          </span>
        )}
      </div>
      {entry.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {entry.note && (
        <p className="mt-1.5 text-sm text-gray-400">{entry.note}</p>
      )}
    </div>
  );
}

export default function Diary({ days }: { days: DiaryDay[] }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Diary</h1>
        </div>

        {days.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-800 p-12 text-center text-gray-500">
            Nothing logged yet. Search for a show to start your diary.
          </div>
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <section key={day.date}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {formatDay(day.date)}
                </h2>
                <div className="space-y-1">
                  {day.entries.map((entry) => (
                    <EntryRow key={entry.uri} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
