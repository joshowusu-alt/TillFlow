import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'receipt-fixture', enforce: 'pre',
    resolveId(id) {
      if (id === '@/components/DeleteFoodSaleButton' || id === path.join(process.cwd(), 'components/DeleteFoodSaleButton')) return '\0fixture-delete';
    },
    load(id) {
      if (id === '\0fixture-delete') return 'export default function DeleteFoodSaleButton(){return null}';
    },
    transform(code, id) {
      const base = process.env.FIXTURE_RECEIPT_BASE_SHA;
      const relative = path.relative(process.cwd(), id);
      if (base && ['app/receipts/[id]/ReceiptClient.tsx', 'app/globals.css', 'lib/escpos.ts'].includes(relative)) {
        return execFileSync('git', ['show', `${base}:${relative}`], { encoding: 'utf8' });
      }
    },
  }, react()],
  resolve: { alias: [{ find: '@', replacement: process.cwd() }] },
  build: { rollupOptions: { input: 'tests/fixtures/receipt-print/index.html' } },
});
