import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppChrome from "@/components/AppChrome";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppChrome />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
