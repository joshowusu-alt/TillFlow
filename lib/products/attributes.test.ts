import {describe,it,expect} from 'vitest';
import {normalizeProductAttributes,parseProductAttributes} from './attributes';
describe('flexible product details',()=>{
 it('allows custom and repeated labels',()=>{expect(parseProductAttributes('[{"label":" Author ","value":"Ama"},{"label":"Author","value":"Kojo"},{"label":"Size","value":"A4"}]')).toEqual([{label:'Author',value:'Ama'},{label:'Author',value:'Kojo'},{label:'Size',value:'A4'}]);});
 it('preserves omitted values for older callers and clears explicitly empty details',()=>{expect(normalizeProductAttributes(undefined)).toBeUndefined();expect(normalizeProductAttributes('[]')).toBeNull();});
 it('rejects partial, malformed and oversized details',()=>{expect(()=>parseProductAttributes('bad')).toThrow();expect(()=>parseProductAttributes('[{"label":"Author","value":""}]')).toThrow();expect(()=>parseProductAttributes(JSON.stringify(Array.from({length:51},()=>({label:'a',value:'b'}))))).toThrow();});
});
