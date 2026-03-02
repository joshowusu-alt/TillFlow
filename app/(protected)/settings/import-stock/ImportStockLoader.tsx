'use client';

/**
 * Client-boundary wrapper for ImportStockClient.
 *
 * WHY THIS FILE EXISTS:
 * When `next/dynamic(() => import('./ImportStockClient'))` is called inside a
 * SERVER component, webpack's server-bundle compiler still creates async server
 * chunks for the entire ImportStockClient import tree — including xlsx (400 kB).
 * Putting the `dynamic()` call here, in a "use client" file, ensures webpack's
 * RSC plugin replaces THIS whole file with a client reference when the server
 * component imports it. The xlsx dependency never enters any server chunk.
 */

import dynamic from 'next/dynamic';

const ImportStockClient = dynamic(() => import('./ImportStockClient'), {
  ssr: false,
  loading: () => (
    <div className="card p-6 animate-pulse">Loading importer…</div>
  ),
});

interface Props {
  units: Array<{ id: string; name: string; pluralName: string }>;
  currency: string;
}

export default function ImportStockLoader({ units, currency }: Props) {
  return <ImportStockClient units={units} currency={currency} />;
}
