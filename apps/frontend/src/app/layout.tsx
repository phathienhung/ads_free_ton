import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdsFree — Earn Rewards | Telegram Advertising Platform",
  description: "Complete ad tasks, earn rewards. Promote your Telegram channel, bot, or group to real users.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
