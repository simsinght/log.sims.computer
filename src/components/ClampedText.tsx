"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A paragraph clamped to four lines, with a "more" toggle that only appears
 * when the text actually overflows the clamp.
 */
export default function ClampedText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className={`text-sm leading-relaxed text-gray-300 ${expanded ? "" : "line-clamp-4"}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="-my-2 py-2 text-sm font-medium text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}
