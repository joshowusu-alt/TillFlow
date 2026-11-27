import React from 'react';
import { createRoot } from 'react-dom/client';
import ReceiptClient from '@/app/receipts/[id]/ReceiptClient';
import '@/app/globals.css';

const params = new URLSearchParams(location.search);
const evidence = { connections: 0, browserPrints: 0, raw: '' };
Object.assign(window, { receiptEvidence: evidence });
Object.defineProperty(navigator, 'webdriver', { value: false });
window.print = () => { evidence.browserPrints++; };
window.qz = {
  websocket: { isActive: () => false, connect: async () => {
    evidence.connections++;
    if (params.get('direct') !== 'success') throw new Error('QZ Tray is not running');
  } },
  configs: { create: () => ({}) },
  print: async (_config: unknown, data: { data: string }[]) => { evidence.raw = data[0].data; },
};

createRoot(document.getElementById('root')!).render(<ReceiptClient
  business={{ id: 'synthetic-demo', name: 'Sunrise Demo Business', currency: 'GHS', vatEnabled: true, vatNumber: 'DEMO-VAT', address: 'Accra, Ghana', phone: '0000000000', tinNumber: 'DEMO-TIN', printMode: 'DIRECT_ESC_POS', receiptTemplate: params.get('template') === 'A4' ? 'A4' : 'THERMAL_80', momoNumber: '0000000000', momoProvider: 'MoMo' }}
  store={{ id: 'synthetic-main', name: 'Main Branch' }} cashier={{ name: 'Demo Cashier' }}
  customer={{ name: 'Demo Customer', phone: '0000000000' }}
  invoice={{ id: 'synthetic-invoice', transactionNumber: 'SAL-000001', createdAt: '2026-11-27T12:00:00Z', subtotalPence: 5000, vatPence: 750, totalPence: 5750, discountPence: 100, changeDuePence: 250 }}
  lines={[{ name: 'Rice', detail: 'Large portion', qtyLabel: '1', unitPricePence: 5750, lineTotalPence: 5750, displayDiscountPence: 100 }]}
  payments={[{ method: 'CASH', amountPence: 3000 }, { method: 'CARD', amountPence: 1000, reference: 'DEMO-CARD' }, { method: 'TRANSFER', amountPence: 750, reference: 'DEMO-BANK' }, { method: 'MOBILE_MONEY', amountPence: 1000, status: 'CONFIRMED', reference: 'DEMO-MOMO' }]}
/>);
