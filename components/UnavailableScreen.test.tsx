import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import UnavailableScreen from './UnavailableScreen';
afterEach(cleanup);
it('shows the approved outage copy, support and a working retry', () => {
  const retry = vi.fn(); render(<UnavailableScreen database retry={retry} />);
  expect(screen.getByRole('heading').textContent).toBe('TillFlow is temporarily unavailable.');
  expect(screen.getByText("Your data is safe. We're working on it. Please try again in a few minutes.")).toBeTruthy();
  expect(screen.getByRole('link').getAttribute('href')).toBe('https://wa.me/233547016160');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(retry).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toMatch(/offline|digest|Prisma|store|shop/i);
});
it('has friendly generic copy without exception details', () => {
  render(<UnavailableScreen />);
  expect(screen.getByRole('heading').textContent).toBe('Something went wrong.');
});
