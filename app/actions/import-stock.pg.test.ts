import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { canRunLivePostgresTests, openTestPrismaClient } from '@/lib/test/test-prisma';
import { parseStockFileDetailed } from '@/lib/import/parse-stock-file';
import type { ConfirmedImportRow, ImportStockMeta } from './import-stock';

const context = vi.hoisted(() => ({ businessId: '', storeId: '', user: { id: '', name: 'Import verification owner', role: 'OWNER' } }));
vi.mock('@/lib/action-utils', () => ({
  UserError: class UserError extends Error {},
  requireSelectedStoreContext: async () => context,
  withBusinessContext: async () => context,
  safeAction: async (work: () => Promise<unknown>) => { try { return await work(); } catch (error) { return { success: false, error: (error as Error).message }; } },
  ok: (data: unknown) => ({ success: true, data }), err: (error: string) => ({ success: false, error }),
}));
vi.mock('@/lib/reliability/operational-store-cookie', () => ({ readOperationalStoreCookie: () => context.storeId }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/improve-records-revalidate', () => ({ revalidateImproveRecordsHome: vi.fn() }));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;
describePg('real PostgreSQL import release verification', () => {
  let db: PrismaClient;
  let action: typeof import('./import-stock');
  let baseUnitId: string;
  let cartonUnitId: string;
  let lastOpening: { rows: ConfirmedImportRow[]; meta: ImportStockMeta; ids: string[] };
  const run = `pg-import-${Date.now()}`;
  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    action = await import('./import-stock');
    context.businessId = (await db.business.create({ data: { name: run, currency: 'GHS' } })).id;
    context.storeId = (await db.store.create({ data: { businessId: context.businessId, name: 'Isolated import verification' } })).id;
    context.user.id = (await db.user.create({ data: { businessId: context.businessId, name: context.user.name, email: `${run}@example.invalid`, role: 'OWNER', passwordHash: 'not-a-login-account' } })).id;
    baseUnitId = (await db.unit.create({ data: { name: `${run} piece`, pluralName: 'pieces' } })).id;
    cartonUnitId = (await db.unit.create({ data: { name: `${run} carton`, pluralName: 'cartons' } })).id;
  }, 60000);
  afterAll(async () => {
    // Fixture tenant is retained only on the 24-hour temporary branch for review.
    await db?.$disconnect();
    const singleton = (globalThis as unknown as { prisma?: PrismaClient }).prisma;
    await singleton?.$disconnect();
  });

  for (const format of ['csv', 'xlsx'] as const) {
    for (const mode of ['CATALOGUE', 'OPENING_STOCK'] as const) {
      it(`${format}: imports every optional classification depth in ${mode}`, async () => {
        const headers = ['name','sku','barcode','selling_price','cost_price','quantity','base_unit','pack_unit','pack_size','qty_in','category','division','group'];
        const matrix = [headers, ...['none','category','division','group'].map((depth, index) => [
          `${run}-${format}-${mode}-${depth}`, `${format}-${mode}-${depth}`, `${run}-${format}-${mode}-${index}`, '5.00','2.00',String(index+2),`${run} piece`,index>=2?`${run} carton`:'',index>=2?'12':'',index>=2?`${run} carton`:`${run} piece`,index>=1?'Import Books':'',index>=2?'Reference':'',index>=3?'Study':'',
        ])];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(matrix),'Products');
        const file = format === 'csv' ? { name:'products.csv', text:async()=>matrix.map(row=>row.join(',')).join('\n') } as File
          : { name:'products.xlsx', arrayBuffer:async()=>XLSX.write(workbook,{type:'array',bookType:'xlsx'}) } as File;
        const parsed = await parseStockFileDetailed(file,mode);
        expect(parsed.rows.every(row=>row.errors.length===0)).toBe(true);
        const rows: ConfirmedImportRow[] = parsed.rows.map(row=>({
          name:row.name,sku:row.sku,barcode:row.barcode,category:row.category,division:row.division,group:row.group,
          sellingPricePence:row.sellingPricePence,costPricePence:row.costPricePence,costPriceProvided:row.costPriceProvided,
          quantity:row.quantity,baseUnitId,packUnitId:row.packUnitName?cartonUnitId:null,packSize:row.packSize,
          qtyInUnitId:row.packUnitName?cartonUnitId:baseUnitId,duplicateAction:'create',storefrontPublished:true,reorderPointBase:2,
        }));
        const meta: ImportStockMeta = { importMode:mode,clientImportKey:`${run}-${format}-${mode}`,fileName:`products.${format}` };
        const result = await action.importStockAction(rows,meta);
        expect(result).toMatchObject({success:true,data:{created:4,updated:0}});
        const products = await db.product.findMany({where:{businessId:context.businessId,name:{in:rows.map(row=>row.name)}},include:{category:true,division:true,group:true,inventoryBalances:true}});
        expect(products).toHaveLength(4);
        for (const [index,row] of rows.entries()) {
          const product = products.find(item=>item.name===row.name)!;
          expect(product.category?.name??'').toBe(row.category);
          expect(product.division?.name??'').toBe(row.division);
          expect(product.group?.name??'').toBe(row.group??'');
          expect(product.inventoryBalances.reduce((sum,balance)=>sum+balance.qtyOnHandBase,0)).toBe(mode==='CATALOGUE'?0:(index+2)*(index>=2?12:1));
        }
        const ids=products.map(product=>product.id);
        const journals=await db.journalEntry.findMany({where:{businessId:context.businessId,referenceId:`${meta.clientImportKey}-equity-0`},include:{lines:{include:{account:true}}}});
        expect(journals).toHaveLength(mode==='CATALOGUE'?0:1);
        if(mode==='OPENING_STOCK') {
          expect(journals[0].lines.reduce((sum,line)=>sum+line.debitPence,0)).toBe(22600);
          expect(journals[0].lines.reduce((sum,line)=>sum+line.creditPence,0)).toBe(22600);
          expect(journals[0].lines.map(line=>line.account.code).sort()).toEqual(['1200','3200']);
          expect(await action.importStockAction(rows,meta)).toMatchObject({success:true});
          expect(await db.product.count({where:{id:{in:ids}}})).toBe(4);
          expect(await db.stockMovement.count({where:{productId:{in:ids}}})).toBe(4);
          expect(await db.journalEntry.count({where:{businessId:context.businessId,referenceId:`${meta.clientImportKey}-equity-0`}})).toBe(1);
          expect((await db.inventoryBalance.aggregate({where:{productId:{in:ids}},_sum:{qtyOnHandBase:true}}))._sum.qtyOnHandBase).toBe(113);
          lastOpening={rows,meta,ids};
        }
      },60000);
    }
  }

  it('creates a new supplier while posting the first opening stock import', async () => {
    const name = `${run}-ingredient`;
    const supplierName = `${run} supplier`;
    expect(await action.importStockAction([{
      name, supplierName, sku: '', barcode: '', category: '', packUnitId: null, packSize: 1, sellingPricePence: 500, costPricePence: 200,
      quantity: 3, baseUnitId, qtyInUnitId: baseUnitId, duplicateAction: 'create', openingFunding: 'EQUITY',
    }], { importMode: 'OPENING_STOCK', clientImportKey: `${run}-first-supplier`, fileName: 'products.csv' }))
      .toMatchObject({ success: true });
    expect(await db.supplier.count({ where: { businessId: context.businessId, name: supplierName } })).toBe(1);
    expect(await db.inventoryBalance.findFirst({ where: { storeId: context.storeId, product: { name } } }))
      .toMatchObject({ qtyOnHandBase: 3 });
  });

  it('preserves existing classification, cost and publishing when optional update cells are blank',async()=>{
    const existing=await db.product.findFirstOrThrow({where:{businessId:context.businessId,groupId:{not:null}}});
    const row:ConfirmedImportRow={name:existing.name,sku:existing.sku??'',barcode:existing.barcode??'',category:'',sellingPricePence:600,costPricePence:0,costPriceProvided:false,quantity:0,baseUnitId,packUnitId:null,packSize:0,qtyInUnitId:baseUnitId,duplicateAction:'update'};
    expect(await action.importStockAction([row],{importMode:'CATALOGUE',clientImportKey:`${run}-update`})).toMatchObject({success:true,data:{updated:1}});
    const saved=await db.product.findUniqueOrThrow({where:{id:existing.id}});
    expect(saved).toMatchObject({categoryId:existing.categoryId,divisionId:existing.divisionId,groupId:existing.groupId,defaultCostBasePence:200,storefrontPublished:true,reorderPointBase:2,sellingPriceBasePence:600});
  },30000);

  it('Skip never adds stock on PostgreSQL',async()=>{
    const before=await db.inventoryBalance.findMany({where:{productId:{in:lastOpening.ids}},orderBy:{productId:'asc'}});
    const input=lastOpening.rows.map(row=>({...row,quantity:99,duplicateAction:'skip' as const}));
    expect(await action.importStockAction(input,{...lastOpening.meta,clientImportKey:`${run}-skip`})).toMatchObject({success:true,data:{skipped:4,stockUpdated:0,openingStockUnits:0}});
    expect(await db.inventoryBalance.findMany({where:{productId:{in:lastOpening.ids}},orderBy:{productId:'asc'}})).toEqual(before);
  },30000);

  it('rejects an altered stock payload reusing a committed import key',async()=>{
    const changed=lastOpening.rows.map((row,index)=>index===0?{...row,quantity:row.quantity+1}:row);
    expect(await action.importStockAction(changed,lastOpening.meta)).toMatchObject({success:false});
    expect((await db.inventoryBalance.aggregate({where:{productId:{in:lastOpening.ids}},_sum:{qtyOnHandBase:true}}))._sum.qtyOnHandBase).toBe(113);
  },30000);
});
