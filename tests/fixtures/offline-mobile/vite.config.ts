import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const actions = ['openShiftAction', 'completeSaleAction', 'checkMomoCollectionStatusAction', 'initiateMomoCollectionAction', 'quickCreateProductAction', 'savePosShortcutsAction', 'quickCreateCustomerAction'];
export default defineConfig({
  plugins: [{
    name: 'fixture-mocks', enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('@/app/actions/') || id.startsWith(path.join(process.cwd(), 'app/actions/'))) return '\0fixture-actions';
      if (id === '@prisma/client') return path.join(process.cwd(), 'node_modules/.prisma/client/index-browser.js');
      if (id === 'next/navigation') return '\0fixture-nav';
      if (id === 'next/link') return '\0fixture-link';
    },
    load(id) {
      if (id === '\0fixture-actions') return actions.map(name => 'export async function '+name+'(){throw new Error("Fixture: server action unavailable")}').join('\n');
      if (id === '\0fixture-nav') return 'export const useRouter=()=>({refresh(){},prefetch(){}});export const usePathname=()=>"/pos";export const useSearchParams=()=>({get:()=>null});';
      if (id === '\0fixture-link') return 'import React from "react";export default function Link(p){return React.createElement("a",p)}';
    },
    transform(code, id) {
      if (!process.env.FIXTURE_BASE_SHA) return;
      const relative = path.relative(process.cwd(), id);
      if (['app/(protected)/pos/PosClient.tsx','app/(protected)/pos/components/PosMobileCartCheckoutSheet.tsx','components/pos/PosProgressiveShell.tsx','components/NetworkStatus.tsx','app/globals.css'].includes(relative)) return execFileSync('git', ['show',process.env.FIXTURE_BASE_SHA+':'+relative], {encoding:'utf8'});
    }
  }, react()],
  resolve: { alias: [{find:'@', replacement: process.cwd()}] },
  build: { rollupOptions: { input: 'tests/fixtures/offline-mobile/index.html' } },
  // The generated Prisma browser enums expect a bundler-provided global alias.
  define: { global: 'globalThis', 'process.env.NODE_ENV': JSON.stringify('development') },
});
