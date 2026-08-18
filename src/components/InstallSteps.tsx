// Steps 1–3 are real iOS 26 Safari screenshots from public/install/. Steps 4–5
// have no screenshot yet and use hand-drawn stand-ins; to swap those out, drop
// a PNG in public/install/ and replace the step's `illustration` with <Shot>.
import Image from "next/image";
import type { ReactNode } from "react";

const BG = "#0a0a0a";
const PANEL = "#141414";
const BORDER = "#1f2937";
const MUTED = "#6b7280";
const TEXT = "#ededed";
const LIME = "#a3e635";
const FONT = "Arial, Helvetica, sans-serif";

const FRAME = "mx-auto block h-auto w-full max-w-[320px]";

function Shot({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes="(max-width: 640px) 100vw, 320px"
      className={`${FRAME} rounded-2xl border border-gray-800`}
    />
  );
}

function ConfirmStep() {
  return (
    <div
      role="img"
      aria-label="The Add to Home Screen confirmation with the tvlog icon and an Add button"
      className={`${FRAME} overflow-hidden rounded-2xl border border-gray-800 bg-[#141414] pb-4`}
    >
      <div className="flex items-center justify-between px-5 pt-4 text-sm">
        <span className="text-gray-400">Cancel</span>
        <span className="font-semibold text-[#ededed]">Add to Home Screen</span>
        <span className="rounded-full border-2 border-lime-400 px-2 py-0.5 font-semibold text-lime-400">
          Add
        </span>
      </div>
      <div className="mx-5 mt-5 flex items-center gap-4 rounded-xl bg-[#1a1a1a] p-3">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-xl"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#ededed]">tvlog</p>
          <p className="truncate text-xs text-gray-500">
            https://tvlog.sims.computer
          </p>
        </div>
      </div>
      <p className="mx-5 mt-4 text-[11px] leading-snug text-gray-500">
        An icon will be added to your Home Screen so you can quickly access
        this website.
      </p>
    </div>
  );
}

function HomeScreenStep() {
  const cells = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label="A home screen with the tvlog icon highlighted"
      className={FRAME}
    >
      <rect width="320" height="240" rx="24" fill={PANEL} />
      <rect
        x="0.5"
        y="0.5"
        width="319"
        height="239"
        rx="24"
        fill="none"
        stroke={BORDER}
      />
      {cells.map((i) => {
        const x = 34 + (i % 4) * 68;
        const y = 34 + Math.floor(i / 4) * 92;
        const isApp = i === 5;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width="52"
              height="52"
              rx="12"
              fill={isApp ? BG : "#262626"}
            />
            {isApp && (
              <>
                <rect
                  x={x + 10}
                  y={y + 12}
                  width="32"
                  height="22"
                  rx="4"
                  fill="none"
                  stroke={TEXT}
                  strokeWidth="2"
                />
                <circle cx={x + 18} cy={y + 41} r="2.5" fill={MUTED} />
                <circle cx={x + 26} cy={y + 41} r="2.5" fill={MUTED} />
                <circle cx={x + 34} cy={y + 41} r="2.5" fill={LIME} />
                <rect
                  x={x - 4}
                  y={y - 4}
                  width="60"
                  height="60"
                  rx="15"
                  fill="none"
                  stroke={LIME}
                  strokeWidth="2.5"
                />
                <text
                  x={x + 26}
                  y={y + 70}
                  textAnchor="middle"
                  fill={TEXT}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily={FONT}
                >
                  tvlog
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface InstallStep {
  title: string;
  caption: string;
  illustration: ReactNode;
}

export const installSteps: InstallStep[] = [
  {
    title: "Open tvlog.sims.computer in Safari and tap ···",
    caption:
      "It has to be Safari — Chrome and other iOS browsers can't add sites to the home screen. The ··· button is on the right of the bottom bar. On older iOS there's no ··· menu: tap the Share button (the square-with-arrow icon) in the bottom bar instead and skip to step 3.",
    illustration: (
      <Shot
        src="/install/step-1-safari-menu.png"
        alt="tvlog open in Safari, with the ··· button at the right of the bottom bar"
        width={460}
        height={1000}
      />
    ),
  },
  {
    title: "Tap Share",
    caption: "It's the top row of the ··· menu.",
    illustration: (
      <Shot
        src="/install/step-2-share.png"
        alt="Safari's ··· menu open, with Share as the top row"
        width={460}
        height={1000}
      />
    ),
  },
  {
    title: "Tap “Add to Home Screen”",
    caption:
      "It's in the list of actions below the row of apps. If you don't see it, tap “View More” (or scroll down).",
    illustration: (
      <Shot
        src="/install/step-3-add-to-home-screen.png"
        alt="The share sheet's action list, with Add to Home Screen as the last row of the first group"
        width={800}
        height={910}
      />
    ),
  },
  {
    title: "Tap Add",
    caption:
      "A sheet shows the tvlog icon and name; tap Add in the top-right. You can rename it first if you like.",
    illustration: <ConfirmStep />,
  },
  {
    title: "Open it from your home screen and sign in",
    caption:
      "The installed app keeps its own session, separate from Safari, so sign in there once and it stays signed in.",
    illustration: <HomeScreenStep />,
  },
];
