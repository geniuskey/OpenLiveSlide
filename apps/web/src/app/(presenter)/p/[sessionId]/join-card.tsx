'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function JoinCard({ joinCode }: { joinCode: string }) {
  const [origin, setOrigin] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    const url = `${origin}/r/${joinCode}`;
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [joinCode, origin]);

  const joinUrl = origin ? `${origin.replace(/^https?:\/\//, '')}/join` : '/join';

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-white/5 p-6 text-center">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt={`Join code ${joinCode}`} className="h-40 w-40 rounded bg-white" />
      ) : (
        <div className="h-40 w-40 animate-pulse rounded bg-slate-700" />
      )}
      <div>
        <p className="text-sm text-slate-400">Join at</p>
        <p className="font-mono text-lg text-slate-200">{joinUrl}</p>
        <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">code</p>
        <p className="font-mono text-3xl font-bold tracking-[0.3em] text-slate-100">{joinCode}</p>
      </div>
    </div>
  );
}
