import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProductUnitPricingEditor from '@/components/ProductUnitPricingEditor';

const units = [
  { id: 'junk', name: 'Piece-554150' },
  { id: 'piece', name: 'piece' },
  { id: 'carton', name: 'carton' },
];

describe('ProductUnitPricingEditor base unit', () => {
  it('exposes a labelled Smallest stock unit combobox that defaults to piece', () => {
    render(<ProductUnitPricingEditor units={units} currencySymbol="GH₵" />);

    const baseUnit = screen.getByRole('combobox', { name: 'Smallest stock unit' });
    expect(baseUnit).toHaveValue('piece');
    expect(baseUnit).toHaveAccessibleName('Smallest stock unit');
  });
});
