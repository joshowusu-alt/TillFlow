import {it,expect,vi,beforeEach} from 'vitest';
const {auth,find}=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireBusiness:auth}));vi.mock('@/lib/prisma',()=>({prisma:{purchaseDocument:{findFirst:find}}}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue({business:{id:'biz'}});});
it('serves invoice bytes only within the authenticated business and purchase',async()=>{find.mockResolvedValue({contentType:'application/pdf',byteLength:5,body:Buffer.from('%PDF-'),originalFilename:'invoice.pdf'});const response=await GET(new Request('https://example.com'),{params:{id:'purchase',documentId:'doc'}});expect(auth).toHaveBeenCalledWith(['OWNER','MANAGER']);expect(find).toHaveBeenCalledWith({where:{id:'doc',businessId:'biz',purchaseInvoiceId:'purchase',purchaseInvoice:{businessId:'biz'}}});expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Content-Disposition')).toContain('attachment;');});
it('does not disclose another business document',async()=>{find.mockResolvedValue(null);expect((await GET(new Request('https://example.com'),{params:{id:'purchase',documentId:'foreign'}})).status).toBe(404);});
