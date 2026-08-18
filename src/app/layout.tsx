import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import AppChrome from "@/components/AppChrome";
import { getSession } from "@/lib/session";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "tvlog",
  description: "a personal TV log",
  applicationName: "tvlog",
  appleWebApp: {
    capable: true,
    title: "tvlog",
    statusBarStyle: "default",
  },
  // Legacy meta that older iOS versions still read for standalone launch;
  // Next only emits the modern `mobile-web-app-capable` from appleWebApp.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Cookie-only read (no PDS round-trip) so the header renders in the same
  // paint as the page instead of appearing after a client session fetch.
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <AppChrome signedIn={Boolean(session.did)} />
        </Suspense>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
