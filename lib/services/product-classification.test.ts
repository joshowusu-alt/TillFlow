import { describe, expect, it, vi } from 'vitest';
const { transaction }=vi.hoisted(()=>({transaction:vi.fn()}));
vi.mock('@/lib/prisma', () => ({ prisma: {$transaction:transaction} }));
import { classificationName, resolveProductClassification, createClassificationNode } from './product-classification';

describe('optional product classification', () => {
  it('preserves a category-only product without querying groups', async () => {
    expect(await resolveProductClassification({}, 'business-a', 'category-a')).toEqual({categoryId:'category-a',groupId:null});
  });
  it('derives the category from the selected group, ignoring a forged umbrella', async () => {
    const findFirst=vi.fn().mockResolvedValue({id:'group-a',division:{categoryId:'category-a'}});
    expect(await resolveProductClassification({productGroup:{findFirst}},'business-a','forged-category','group-a'))
      .toEqual({categoryId:'category-a',groupId:'group-a'});
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'group-a',businessId:'business-a',division:{businessId:'business-a',category:{businessId:'business-a'}}}}));
  });
  it('rejects unavailable or foreign-business groups before a product can be written', async () => {
    await expect(resolveProductClassification({productGroup:{findFirst:vi.fn().mockResolvedValue(null)}},'business-a',null,'foreign'))
      .rejects.toThrow('unavailable');
  });
  it('rejects empty, oversized and control-character names', () => {
    for(const invalid of ['', ' '.repeat(3),'x'.repeat(101),'Books\nOther']) expect(()=>classificationName(invalid)).toThrow();
    expect(classificationName(' Bibles ')).toBe('Bibles');
  });
  it('rejects division creation under a foreign or missing category', async()=>{
    const create=vi.fn();
    transaction.mockImplementation(callback=>callback({category:{findFirst:vi.fn().mockResolvedValue(null)},productDivision:{create}}));
    await expect(createClassificationNode('business-a','division','foreign','Bibles')).rejects.toThrow('from this business');
    expect(create).not.toHaveBeenCalled();
  });
  it('reuses an existing group within its division, including case-insensitive matching', async()=>{
    const create=vi.fn();
    transaction.mockImplementation(callback=>callback({productDivision:{findFirst:vi.fn().mockResolvedValue({id:'division-a'})},productGroup:{findMany:vi.fn().mockResolvedValue([{id:'group-a',name:'Study Bibles'}]),create}}));
    expect(await createClassificationNode('business-a','group','division-a',' study bibles ')).toEqual({id:'group-a',name:'Study Bibles'});
    expect(create).not.toHaveBeenCalled();
  });
});
