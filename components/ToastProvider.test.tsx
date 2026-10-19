import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const pending = vi.hoisted(() => new Promise<never>(() => {}));
vi.mock('next/navigation', () => ({useSearchParams: () => {throw pending;},usePathname:()=>'/products',useRouter:()=>({replace:vi.fn()})}));
import ToastProvider from './ToastProvider';
it('keeps page content visible when URL notification handling suspends', () => {
  render(<ToastProvider><input aria-label="Unsaved product" defaultValue="Exercise book" /></ToastProvider>);
  expect(screen.getByLabelText('Unsaved product')).toHaveValue('Exercise book');
});
