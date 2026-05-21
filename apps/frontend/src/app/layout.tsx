import type { Metadata } from "next";
import Script from "next/script";
import TonConnectProvider from "@/components/TonConnectProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdsFree — Earn Rewards | Telegram Advertising Platform",
  description: "Complete ad tasks, earn rewards. Promote your Telegram channel, bot, or group to real users.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>
        <TonConnectProvider>{children}</TonConnectProvider>
      </body>
    </html>
  );
}
