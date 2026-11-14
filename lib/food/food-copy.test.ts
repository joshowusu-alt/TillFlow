import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'components/food/DishForm.tsx',
  'components/food/FoodPlatePicker.tsx',
  'components/food/PreparePortionsForm.tsx',
  'app/(protected)/products/dishes/new/page.tsx',
  'app/(protected)/products/dishes/[productId]/page.tsx',
];

describe('dish setup stays with the owner', () => {
  it('refuses a cashier on the server, not only in the menu', () => {
    const actions = readFileSync(join(process.cwd(), 'app/actions/food.ts'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'app/(protected)/products/dishes/new/page.tsx'), 'utf8');
    expect(actions).toContain("withBusinessContext(['MANAGER', 'OWNER'])");
    expect(actions).toContain("requireSelectedStoreContext(['MANAGER', 'OWNER']");
    expect(actions).toContain('writeOffCookedPortionsAction');
    expect(actions).not.toContain('CASHIER');
    expect(page).toContain("requireBusiness(['MANAGER', 'OWNER'])");
  });
});

describe('food screens speak about the business', () => {
  it('does not call the business a store or a shop', () => {
    const source = files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');
    const visible = source
      .replace(/storefront[A-Za-z]*/g, '')
      .replace(/\/shop\//g, '');
    expect(visible).not.toMatch(/\bshop\b/i);
    expect(visible).not.toMatch(/\bstore\b/i);
  });
});
