import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountSection from './AccountSection';
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('keeps long history closed initially and supports an explicit open state', () => {
  const { container, rerender } = render(<AccountSection id="history" title="History">Detailed records</AccountSection>);
  expect(container.querySelector('details')?.open).toBe(false);
  expect(screen.getByText('History').closest('summary')).toBeTruthy();
  rerender(<AccountSection id="history" title="History" defaultOpen>Detailed records</AccountSection>);
  expect(container.querySelector('details')?.open).toBe(true);
});
it('reveals the section when its direct action link is used', () => {
  const { container } = render(<AccountSection id="products-supplied" title="Products supplied">Products</AccountSection>);
  window.history.replaceState(null, '', '/#products-supplied');
  fireEvent(window, new Event('hashchange'));
  expect(container.querySelector('details')?.open).toBe(true);
});
it('reopens from the same fragment link after a manual collapse', () => {
  window.history.replaceState(null, '', '/#products-supplied');
  const { container } = render(<><a href="#products-supplied">View products</a><AccountSection id="products-supplied" title="Products supplied">Products</AccountSection></>);
  const details = container.querySelector('details')!;
  details.open = false;
  fireEvent.click(screen.getByText('View products'));
  expect(details.open).toBe(true);
});
