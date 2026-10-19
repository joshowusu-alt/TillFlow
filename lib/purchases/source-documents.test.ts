import {describe,it,expect} from 'vitest';
import {decodePurchaseDocuments,validatePurchaseDocuments} from './source-documents';
import {purchaseDocumentFixture} from '@/lib/test/purchase-document-fixture';
describe('source invoice documents',()=>{
 it('requires genuine file bytes and retains a content fingerprint',()=>{const [document]=validatePurchaseDocuments([purchaseDocumentFixture()]);expect(document.contentType).toBe('application/pdf');expect(document.sha256).toMatch(/^[a-f0-9]{64}$/);expect(document.byteLength).toBe(document.body.length);expect(()=>validatePurchaseDocuments([])).toThrow('Attach');});
 it('rejects spoofed types, oversized data and too many files',()=>{expect(()=>validatePurchaseDocuments([{...purchaseDocumentFixture(),body:Buffer.from('<script>bad</script>')}])).toThrow('valid PDF');expect(()=>validatePurchaseDocuments([{...purchaseDocumentFixture(),body:Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(2*1024*1024)])}])).toThrow('2 MB');expect(()=>validatePurchaseDocuments(Array.from({length:6},purchaseDocumentFixture))).toThrow('five');});
 it('round trips uploads and rejects malformed payloads',()=>{const original=purchaseDocumentFixture();const [decoded]=decodePurchaseDocuments(JSON.stringify([{name:original.name,contentType:original.contentType,base64:Buffer.from(original.body).toString('base64')}]));expect(decoded.body).toEqual(original.body);expect(()=>decodePurchaseDocuments('bad')).toThrow();expect(()=>decodePurchaseDocuments('[{"base64":"<script>"}]')).toThrow();});
});
