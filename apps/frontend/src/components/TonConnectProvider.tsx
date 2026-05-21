'use client';

import { TonConnectUIProvider } from '@tonconnect/ui-react';

const manifestUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/tonconnect-manifest.json`
  : 'https://frontend-ten-ashen-sp7mwrn5v9.vercel.app/tonconnect-manifest.json';

export default function TonConnectProvider({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
