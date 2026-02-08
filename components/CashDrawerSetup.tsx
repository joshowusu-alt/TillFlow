'use client';

import { useEffect, useState } from 'react';
import {
  isCashDrawerEnabled,
  isSerialSupported,
  openCashDrawer,
  requestCashDrawerPort,
  setCashDrawerEnabled
} from '@/lib/hardware';

export default function CashDrawerSetup() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setEnabled(isCashDrawerEnabled());
    setSupported(isSerialSupported());
  }, []);

  const toggleEnabled = (value: boolean) => {
    setEnabled(value);
    setCashDrawerEnabled(value);
  };

  const handlePair = async () => {
    setStatus('');
    try {
      await requestCashDrawerPort();
      setStatus('Cash drawer paired. Use "Test drawer" to verify.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to pair drawer.';
      setStatus(message);
    }
  };

  const handleTest = async () => {
    setStatus('');
    try {
      await openCashDrawer();
      setStatus('Drawer pulse sent.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open drawer.';
      setStatus(message);
    }
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4">
      <div className="text-sm font-semibold">Cash Drawer</div>
      <div className="mt-1 text-xs text-black/60">
        Connect an ESC/POS cash drawer via Web Serial and trigger it on cash receipts.
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggleEnabled(event.target.checked)}
            disabled={!supported}
          />
          Enable drawer trigger
        </label>
        <button type="button" className="btn-secondary text-xs" onClick={handlePair} disabled={!supported}>
          Pair device
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={handleTest} disabled={!supported}>
          Test drawer
        </button>
      </div>
      {!supported ? (
        <div className="mt-2 text-xs text-amber-700">
          Web Serial is not supported in this browser. Use Chrome or Edge on desktop.
        </div>
      ) : null}
      {status ? <div className="mt-2 text-xs text-black/60">{status}</div> : null}
    </div>
  );
}
