import {beforeEach,describe,expect,it,vi} from 'vitest';
import {purchaseDocumentFixture} from '@/lib/test/purchase-document-fixture';
import {validatePurchaseDocuments} from '@/lib/purchases/source-documents';
const mocks=vi.hoisted(()=>({context:vi.fn(),purchase:vi.fn(),db:{purchaseInvoice:{findFirst:vi.fn(),update:vi.fn()},purchaseDocument:{createMany:vi.fn()},auditLog:{create:vi.fn()},$transaction:vi.fn()}}));
vi.mock('@/lib/prisma',()=>({prisma:mocks.db}));
vi.mock('@/lib/services/purchases',()=>({createPurchase:mocks.purchase}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn(),revalidateTag:vi.fn()}));
vi.mock('@/lib/action-utils',async()=>({...await vi.importActual<object>('@/lib/action-utils'),withBusinessContext:mocks.context}));
import {addPurchaseDocumentsAction} from './purchases';
describe('invoice follow-up after delivery-note receipt',()=>{
  const document=purchaseDocumentFixture();
  const form=()=>{const data=new FormData();data.set('invoiceId','purchase');data.set('documentKind','INVOICE');data.set('supplierInvoiceNumber','INV-20');data.set('purchaseDocumentsJson',JSON.stringify([{name:document.name,contentType:document.contentType,base64:document.body.toString('base64')}]));return data;};
  beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue({businessId:'business',user:{id:'owner',name:'Owner',role:'OWNER'}});mocks.db.$transaction.mockImplementation(cb=>cb(mocks.db));mocks.db.purchaseInvoice.findFirst.mockResolvedValue({id:'purchase',receiptDocumentType:'DELIVERY_NOTE',invoiceReceivedAt:null,supplierInvoiceNumber:null,documents:[]});});
  it('closes invoice follow-up and audits the reference without receiving or paying again',async()=>{
    expect(await addPurchaseDocumentsAction(form())).toMatchObject({success:true});
    expect(mocks.context).toHaveBeenCalledWith(['OWNER','MANAGER']);
    expect(mocks.db.purchaseInvoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'purchase',businessId:'business'}}));
    expect(mocks.db.purchaseInvoice.update).toHaveBeenCalledWith({where:{id:'purchase'},data:{invoiceReceivedAt:expect.any(Date),supplierInvoiceNumber:'INV-20'}});
    expect(mocks.db.purchaseDocument.createMany).toHaveBeenCalledWith(expect.objectContaining({data:[expect.objectContaining({documentKind:'INVOICE',businessId:'business',purchaseInvoiceId:'purchase'})]}));
    expect(mocks.db.auditLog.create).toHaveBeenCalled();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it('does not treat the existing delivery-note bytes as a new supplier invoice',async()=>{
    mocks.db.purchaseInvoice.findFirst.mockResolvedValue({id:'purchase',receiptDocumentType:'DELIVERY_NOTE',invoiceReceivedAt:null,documents:[{sha256:validatePurchaseDocuments([document])[0].sha256,documentKind:'DELIVERY_NOTE'}]});
    const result=await addPurchaseDocumentsAction(form());
    expect(result).toMatchObject({success:false,error:'Attach the supplier invoice as a new document. The delivery note is already saved.'});
    expect(mocks.db.purchaseInvoice.update).not.toHaveBeenCalled();
    expect(mocks.db.purchaseDocument.createMany).not.toHaveBeenCalled();
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
});
