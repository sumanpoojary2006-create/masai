import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Masai",
  description:
    "Track lecture resource uploads, monitor LMS compliance, and trigger Slack alerts from one shared workspace."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
