// @vitest-environment node
import { build } from 'esbuild';
import { expect, it } from 'vitest';
it('bundles POS cart pricing for the browser without Prisma or database utilities', async () => {
  const result = await build({ entryPoints: ['lib/payments/pos-cart.ts'], bundle: true,
    platform: 'browser', write: false, metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(result.metafile!.inputs);
  expect(inputs.some(path => /lib\/prisma\.ts|@prisma\/client|inventory-utils/.test(path))).toBe(false);
});
