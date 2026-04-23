import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MasaiLens by Masai",
  description:
    "Track lecture resource uploads, monitor LMS compliance, and trigger Slack alerts from one shared MasaiLens workspace."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="bg-haze text-ink antialiased">{children}</body>
    </html>
  );
}
