import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('products page polish', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/products/page.tsx'), 'utf8');

  it('uses owner-friendly Products page copy', () => {
    expect(src).toContain('Manage the items you sell, their prices, stock levels, and suppliers.');
    expect(src).not.toContain('Your live catalogue for pricing, stock, and barcode selling.');
  });

  it('renders a light stat strip from already-loaded Products page data', () => {
    expect(src).toContain('ProductStatCard');
    expect(src).toContain('Total products');
    expect(src).toContain('Visible products');
    expect(src).toContain('Categories');
    expect(src).toContain('Suppliers available');
    expect(src).toContain("totalProductCount.toLocaleString('en-GH')");
    expect(src).toContain("products.length.toLocaleString('en-GH')");
    expect(src).toContain("categories.length.toLocaleString('en-GH')");
    expect(src).toContain("suppliers.length.toLocaleString('en-GH')");
  });

  it('keeps the Add product form present but closed by default', () => {
    expect(src).toContain('<details className="group">');
    expect(src).toContain('id="product-create"');
    expect(src).toContain('ProductCreateFormEnhancer');
    expect(src).not.toMatch(/<details[^>]*open/);
  });

  it('places product search before the collapsed Add product form', () => {
    expect(src.indexOf('{/* Product search and actions */}')).toBeLessThan(src.indexOf('{/* Add product */}'));
    expect(src.indexOf('SearchFilter placeholder="Search products')).toBeGreaterThan(-1);
    expect(src.indexOf('id="product-create"')).toBeGreaterThan(src.indexOf('SearchFilter placeholder="Search products'));
  });

  it('preserves product creation, image, unit, supplier, category, and product routes', () => {
    expect(src).toContain('createAction={createProductAction}');
    expect(src).toContain('ProductImageInput fileUploadEnabled={fileUploadEnabled}');
    expect(src).toContain('ProductUnitPricingEditor');
    expect(src).toContain('name="preferredSupplierId"');
    expect(src).toContain('Used by Sales by Linked Supplier reporting');
    expect(src).toContain('href="/products?tab=categories"');
    expect(src).toContain('href={`/products/${product.id}`}');
    expect(src).toContain('/suppliers/${product.preferredSupplier.id}');
  });

  it('adds list polish without pointer or touch handlers', () => {
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('hover:shadow-card');
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('hover:bg-slate-50');
    expect(src).toContain('Open product');
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
  });
});
