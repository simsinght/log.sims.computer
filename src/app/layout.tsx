import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "log.sims.computer",
  description: "Personal movie & TV log on atproto",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
