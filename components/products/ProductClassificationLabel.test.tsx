import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ProductClassificationLabel from './ProductClassificationLabel';
it('emphasises the assigned group and retains both parent names', () => {
  const view = render(<ProductClassificationLabel category={{ name: 'Christian Literature' }} group={{ name: 'General Bibles', division: { name: 'Bibles' } }} />);
  expect(view.container.textContent).toBe('General BiblesChristian Literature → Bibles');
  expect(screen.getByText('General Bibles')).toBeVisible();
});
it('keeps category-only and uncategorised products understandable', () => {
  const view = render(<ProductClassificationLabel category={{ name: 'Gifts' }} group={null} />);
  expect(screen.getByText('Gifts')).toBeVisible(); expect(screen.getByText('Category only')).toBeVisible();
  view.rerender(<ProductClassificationLabel category={null} group={null} />); expect(screen.getByText('Uncategorised')).toBeVisible();
});
