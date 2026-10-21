import {describe,expect,it} from 'vitest';
import {parseStockFileDetailed,enrichRowsWithCatalog} from './parse-stock-file';
const csvFile=(contents:string)=>({name:'products.csv',text:async()=>contents} as File);
describe('optional hierarchy import',()=>{
  it('preserves all three names through parsing and catalog enrichment',async()=>{
    const result=await parseStockFileDetailed(csvFile('name,category,division,group,selling_price,cost_price,base_unit\nBook,Christian Literature,Christian Living,Books,50,25,Piece'));
    expect(result.rows[0]).toMatchObject({category:'Christian Literature',division:'Christian Living',group:'Books',errors:[]});
    expect(enrichRowsWithCatalog(result.rows,{productNames:[],barcodes:[],skus:[]})[0]).toMatchObject({division:'Christian Living',group:'Books'});
  });
  it('rejects incomplete hierarchy paths while allowing category-only files',async()=>{
    const incomplete=await parseStockFileDetailed(csvFile('name,category,group,selling_price,cost_price,base_unit\nBook,Christian Literature,Books,50,25,Piece'));
    expect(incomplete.rows[0].errors).toContain('Provide category, division and group together.');
    const simple=await parseStockFileDetailed(csvFile('name,category,selling_price,cost_price,base_unit\nBook,Books,50,25,Piece'));
    expect(simple.rows[0].errors).toEqual([]);
  });
});
