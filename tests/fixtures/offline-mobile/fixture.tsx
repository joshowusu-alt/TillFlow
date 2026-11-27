import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { PosDeferredApply, PosProgressiveShell } from '@/components/pos/PosProgressiveShell';
import NetworkStatus from '@/components/NetworkStatus';
import { getPendingSales, setActiveOfflineScope } from '@/lib/offline';

const business = { id: 'fixture-business', currency: 'GHS', vatEnabled: false, foodBusiness: true, canManageDishes: true };
const store = { id: 'fixture-store', name: 'Fixture branch' };
const cashierUserId = 'fixture-owner';
const shiftBannerMode = new URLSearchParams(location.search).get('journey') === 'shift-banner';
localStorage.setItem('pos.savedTill.fixture-business.fixture-store', 'fixture-till');
localStorage.setItem('pos.capture.shift.fixture-business.fixture-till', 'fixture-shift');
localStorage.setItem('pos.capture.cashier.fixture-business', cashierUserId);
document.cookie = 'pos_active_business=fixture-business; path=/';
Object.defineProperty(navigator, 'onLine', { get: () => shiftBannerMode });
void setActiveOfflineScope({ businessId: business.id, storeId: store.id }).catch(error => console.error('Fixture offline scope:', error));
const products = [{ id: 'fixture-rice', name: 'Chek Chek (Fried Rice)', sku: 'RICE', barcode: '12345', sellingPriceBasePence: 3500, vatRateBps: 0, isTaxable: false, promoBuyQty: 0, promoGetQty: 0, categoryName: 'Rice', onHandBase: 0, units: [{ id: 'plate', name: 'Plate', pluralName: 'Plates', conversionToBase: 1, isBaseUnit: true, sellingPricePence: 3500 }], food: { productId: 'fixture-rice', name: 'Chek Chek (Fried Rice)', stockMode: 'NOT_COUNTED' as const, soldOut: false, lowAt: 1, sizes: [{ id: 'regular', name: 'Regular', pricePence: 3500, isDefault: true }], inclusions: [], groups: [] } }];
(window as Window & { fixturePending?: () => ReturnType<typeof getPendingSales> }).fixturePending = () => getPendingSales(business.id);
createRoot(document.getElementById('root')!).render(<><div className="px-3 py-2 bg-white border-b text-sm font-bold">TillFlow · {shiftBannerMode ? 'Shift banner fixture' : 'Offline fixture'}</div><PosProgressiveShell business={business} store={store} products={products} cashierUserId={cashierUserId} welcomeFirstName={shiftBannerMode ? 'Owner' : undefined}>
  {shiftBannerMode ? <PosDeferredApply payload={{
    tills:[{id:'t1',name:'Till 1'},{id:'t2',name:'Till 2'},{id:'t3',name:'Seasonal counter'},{id:'t4',name:'Second counter'}],
    openShiftTillIds:['t1','t3','t4'],
    openShifts:[{tillId:'t1',shiftId:'s1',userId:'other',userName:'Kingsley Mensah'},{tillId:'t3',shiftId:'s3',userId:cashierUserId,userName:'Owner'},{tillId:'t4',shiftId:'s4',userId:cashierUserId,userName:'Owner'}],
    cashierUserId,customers:[],units:[],categories:[],
  }}/> : null}
</PosProgressiveShell><NetworkStatus /></>);
