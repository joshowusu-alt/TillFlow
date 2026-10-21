import {createHash} from 'node:crypto';
export const MAX_PURCHASE_DOCUMENT_BYTES=2*1024*1024;
export type PurchaseDocumentInput={name:string;contentType:string;body:Uint8Array};
export type EncodedPurchaseDocument={name:string;contentType:string;base64:string};
export function validatePurchaseDocuments(documents:PurchaseDocumentInput[]){
  if(!documents.length)throw new Error('Attach the supplier’s invoice or delivery note before recording this purchase.');
  if(documents.length>5)throw new Error('Attach up to five invoice files.');
  let size=0;
  return documents.map(document=>{
    if(!document||typeof document.name!=='string'||(!Buffer.isBuffer(document.body)&&!(document.body instanceof Uint8Array)))throw new Error('Invoice attachment could not be read.');
    const body=Buffer.from(document.body),type=document.contentType;
    const pdf=type==='application/pdf'&&body.subarray(0,5).toString()==='%PDF-';
    const jpg=type==='image/jpeg'&&body[0]===255&&body[1]===216&&body[2]===255;
    const png=type==='image/png'&&body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=type==='image/webp'&&body.subarray(0,4).toString()==='RIFF'&&body.subarray(8,12).toString()==='WEBP';
    if(!pdf&&!jpg&&!png&&!webp)throw new Error('Attach a valid PDF, JPEG, PNG or WebP invoice.');
    size+=body.length;if(!body.length||size>MAX_PURCHASE_DOCUMENT_BYTES)throw new Error('Invoice files must total no more than 2 MB.');
    const originalFilename=document.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,160)||'Invoice';
    return {originalFilename,contentType:type,byteLength:body.length,body,sha256:createHash('sha256').update(body).digest('hex')};
  });
}
export function decodePurchaseDocuments(raw:string):PurchaseDocumentInput[]{
  if(!raw)return [];
  if(raw.length>3000000)throw new Error('Invoice files must total no more than 2 MB.');
  let entries:EncodedPurchaseDocument[];
  try{entries=JSON.parse(raw);}catch{throw new Error('Invoice attachment could not be read.');}
  if(!Array.isArray(entries)||entries.length>5)throw new Error('Attach up to five invoice files.');
  return entries.map(entry=>{
    if(!entry||typeof entry.base64!=='string'||!entry.base64||!/^[A-Za-z0-9+/]*={0,2}$/.test(entry.base64))throw new Error('Invoice attachment could not be read.');
    return {name:entry.name,contentType:entry.contentType,body:Buffer.from(entry.base64,'base64')};
  });
}
