import {describe,it,expect} from 'vitest';
import {allocateCostByQuantity,splitPurchaseTender} from './additional-costs';
describe('purchase additional costs',()=>{
 it('allocates by physical quantity independently of selling or purchase values',()=>{expect(allocateCostByQuantity(100,[1,3])).toEqual([25,75]);});
 it('preserves every pesewa across equal and unequal quantities',()=>{expect(allocateCostByQuantity(101,[1,1,1])).toEqual([34,34,33]);for(let amount=0;amount<120;amount++){const result=allocateCostByQuantity(amount,[3,8,19]);expect(result.reduce((a,b)=>a+b,0)).toBe(amount);}});
 it('rejects invalid quantity and cost rather than dropping value',()=>{expect(()=>allocateCostByQuantity(1,[0,1])).toThrow();expect(()=>allocateCostByQuantity(-1,[1])).toThrow();});
 it('splits partial mixed tender once between goods and expense',()=>{const result=splitPurchaseTender([{method:'CASH',amountPence:300},{method:'CARD',amountPence:250}],1000,100);expect(result.costPaid).toBe(50);expect(result.goods.reduce((s,p)=>s+p.amountPence,0)).toBe(500);expect(result.expenses.reduce((s,p)=>s+p.amountPence,0)).toBe(50);expect([...result.goods,...result.expenses].filter(p=>p.method==='CASH').reduce((s,p)=>s+p.amountPence,0)).toBe(300);});
 it('fully pays both documents with no duplicated money',()=>{const result=splitPurchaseTender([{method:'CASH',amountPence:1100,reference:'funding:owner'}],1000,100);expect(result.goods).toEqual([{method:'CASH',amountPence:1000,reference:'funding:owner'}]);expect(result.expenses).toEqual([{method:'CASH',amountPence:100,reference:'funding:owner'}]);expect(()=>splitPurchaseTender([{method:'CASH',amountPence:1101}],1000,100)).toThrow();});
});
