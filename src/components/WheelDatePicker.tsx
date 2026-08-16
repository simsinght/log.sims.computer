"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const PAD = ITEM_H * 2;
const START_YEAR = 2000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface WheelItem {
  key: string;
  label: string;
}

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  ariaLabel,
  align,
}: {
  items: WheelItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  align: "start" | "center" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const committed = useRef(selectedIndex);
  const rafId = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = selectedIndex * ITEM_H;
    committed.current = selectedIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedIndex !== committed.current && ref.current) {
      committed.current = selectedIndex;
      ref.current.scrollTo({ top: selectedIndex * ITEM_H, behavior: "smooth" });
    }
  }, [selectedIndex]);

  function handleScroll() {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = ref.current;
      if (!el) return;
      const idx = Math.max(
        0,
        Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)),
      );
      if (idx !== committed.current) {
        committed.current = idx;
        onSelect(idx);
      }
    });
  }

  const textAlign =
    align === "start"
      ? "text-left pl-2"
      : align === "end"
        ? "text-right pr-2"
        : "text-center";

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="wheel-col relative flex-1 overflow-y-auto"
      style={{
        height: ITEM_H * VISIBLE_ROWS,
        scrollSnapType: "y mandatory",
        WebkitMaskImage:
          "linear-gradient(180deg, transparent 0%, #000 34%, #000 66%, transparent 100%)",
        maskImage:
          "linear-gradient(180deg, transparent 0%, #000 34%, #000 66%, transparent 100%)",
      }}
    >
      <div style={{ height: PAD }} aria-hidden="true" />
      {items.map((item, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() =>
              ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })
            }
            className={`flex w-full items-center justify-center ${textAlign} tabular-nums transition-colors ${
              selected
                ? "text-lg font-medium text-white"
                : "text-base text-gray-500"
            }`}
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            {item.label}
          </button>
        );
      })}
      <div style={{ height: PAD }} aria-hidden="true" />
    </div>
  );
}

export default function WheelDatePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (next: Date) => void;
}) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = START_YEAR; y <= currentYear; y++) years.push(y);

  const dayCount = daysInMonth(year, month);

  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);

  function commit(nextYear: number, nextMonth: number, nextDay: number) {
    const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth));
    onChange(new Date(nextYear, nextMonth, clampedDay, 12, 0, 0, 0));
  }

  const monthItems: WheelItem[] = MONTH_ABBR.map((label, i) => ({
    key: `m${i}`,
    label,
  }));
  const dayItems: WheelItem[] = Array.from({ length: dayCount }, (_, i) => ({
    key: `d${i + 1}`,
    label: String(i + 1),
  }));
  const yearItems: WheelItem[] = years.map((y) => ({
    key: `y${y}`,
    label: String(y),
  }));

  return (
    <div>
      <p className="mb-3 text-center text-sm font-medium text-gray-200">
        {weekday}
      </p>
      <div className="relative rounded-xl border border-gray-800 bg-[#0a0a0a]">
        <div
          className="pointer-events-none absolute inset-x-2 z-10 rounded-lg border-y border-gray-700 bg-white/[0.04]"
          style={{ top: PAD, height: ITEM_H }}
          aria-hidden="true"
        />
        <div className="flex px-2">
          <WheelColumn
            items={monthItems}
            selectedIndex={month}
            onSelect={(i) => commit(year, i, day)}
            ariaLabel="Month"
            align="start"
          />
          <WheelColumn
            items={dayItems}
            selectedIndex={day - 1}
            onSelect={(i) => commit(year, month, i + 1)}
            ariaLabel="Day"
            align="center"
          />
          <WheelColumn
            items={yearItems}
            selectedIndex={year - START_YEAR}
            onSelect={(i) => commit(START_YEAR + i, month, day)}
            ariaLabel="Year"
            align="end"
          />
        </div>
      </div>
    </div>
  );
}
