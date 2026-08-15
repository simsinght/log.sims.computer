import type { Metadata } from "next";
import "./globals.css";
import AuthStatus from "@/components/AuthStatus";

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
      <body>
        <div className="fixed right-4 top-4 z-50">
          <AuthStatus />
        </div>
        {children}
      </body>
    </html>
  );
}
