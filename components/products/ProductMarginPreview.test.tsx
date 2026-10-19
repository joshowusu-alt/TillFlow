import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ProductMarginPreview from './ProductMarginPreview';
it('calculates profit, margin and markup independently as prices change', () => {
  render(<form><input aria-label="Cost" name="defaultCostBasePence" defaultValue="80" /><input aria-label="Price" name="sellingPriceBasePence" defaultValue="100" /><ProductMarginPreview currency="GHS" /></form>);
  expect(screen.getByRole('status')).toHaveTextContent('20.0% margin · 25.0% markup');
  fireEvent.input(screen.getByLabelText('Price'), { target: { value: '60' } });
  expect(screen.getByRole('status')).toHaveTextContent('-33.3% margin · -25.0% markup');
  fireEvent.input(screen.getByLabelText('Cost'), { target: { value: '' } });
  expect(screen.getByRole('status')).toHaveTextContent('Enter cost and selling price');
});
