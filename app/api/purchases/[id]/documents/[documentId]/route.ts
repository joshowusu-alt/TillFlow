import {requireBusiness} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string;documentId:string}}){
 const {business}=await requireBusiness(['OWNER','MANAGER']);
 if(!business)return new Response('Not found',{status:404});
 const document=await prisma.purchaseDocument.findFirst({where:{id:params.documentId,businessId:business.id,purchaseInvoiceId:params.id,purchaseInvoice:{businessId:business.id}}});
 if(!document)return new Response('Not found',{status:404});
 return new Response(document.body as unknown as BodyInit,{headers:{'Content-Type':document.contentType,'Content-Length':String(document.byteLength),'Content-Disposition':`${document.contentType==='application/pdf'?'attachment':'inline'}; filename="invoice"; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
