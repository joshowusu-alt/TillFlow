import {validatePurchaseDocuments} from './source-documents';
export function serializePurchaseDocument<T extends {body:Uint8Array}>(document:T){
  const {body,...metadata}=document;
  return {...metadata,bodyBase64:Buffer.from(body).toString('base64')};
}
export function restorePurchaseDocument(raw:any,businessId:string,invoiceIds:Set<string>){
  if(!raw||typeof raw.id!=='string'||!invoiceIds.has(raw.purchaseInvoiceId)||typeof raw.bodyBase64!=='string')throw new Error('Backup invoice documents must belong to purchases in this backup.');
  const [document]=validatePurchaseDocuments([{name:raw.originalFilename,contentType:raw.contentType,body:Buffer.from(raw.bodyBase64,'base64')}]);
  if(document.sha256!==raw.sha256||document.byteLength!==raw.byteLength)throw new Error('A backup invoice document failed its integrity check.');
  const createdAt=new Date(raw.createdAt);
  if(!Number.isFinite(createdAt.getTime()))throw new Error('A backup invoice document has an invalid upload date.');
  if(raw.documentKind && !['INVOICE','DELIVERY_NOTE'].includes(raw.documentKind))throw new Error('A backup document has an invalid kind.');
  return {id:raw.id,businessId,purchaseInvoiceId:raw.purchaseInvoiceId,...document,documentKind:raw.documentKind??'INVOICE',createdAt,uploadedByUserId:typeof raw.uploadedByUserId==='string'?raw.uploadedByUserId:null};
}
