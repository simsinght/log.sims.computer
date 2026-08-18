import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { installSteps } from "@/components/InstallSteps";

export const metadata: Metadata = {
  title: "Install tvlog",
};

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-6 lg:max-w-lg">
        <BackLink />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Install tvlog</h1>
        <p className="mt-2 text-gray-400">
          Add it to your home screen: full-screen, one tap from your phone, and
          it stays signed in.
        </p>

        <ol className="mt-8 space-y-10">
          {installSteps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-black"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-tight">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h2>
                <p className="mt-1 text-sm text-gray-400">{step.caption}</p>
                <div className="mt-3">{step.illustration}</div>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12 rounded-xl border border-gray-800 bg-[#141414] p-4">
          <h2 className="text-sm font-semibold">On Android</h2>
          <p className="mt-1 text-sm text-gray-400">
            Chrome shows an <span className="text-gray-200">Install</span>{" "}
            button in the tvlog banner. If it doesn&apos;t, open Chrome&apos;s{" "}
            <span aria-hidden="true">&#8942;</span>
            <span className="sr-only">more</span> menu and tap{" "}
            <span className="text-gray-200">Add to Home screen</span>.
          </p>
        </section>
      </main>
    </div>
  );
}
