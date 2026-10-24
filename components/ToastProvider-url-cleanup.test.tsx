import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));
import ToastProvider from './ToastProvider';
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.clearAllMocks(); });
it('consumes success without a router navigation or remounting the next form', () => {
  window.history.replaceState(null, '', '/users?success=created&edit=cashier#account');
  render(<ToastProvider><input aria-label="Next staff edit" defaultValue="Unsaved name" /></ToastProvider>);
  const input = screen.getByLabelText('Next staff edit');
  expect(screen.getByRole('status')).toHaveTextContent('created');
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/users?edit=cashier#account');
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(input).toHaveValue('Unsaved name');
  expect(screen.getByLabelText('Next staff edit')).toBe(input);
});
it('consumes ordinary errors but preserves login validation parameters', () => {
  window.history.replaceState(null, '', '/users?error=Rejected&filter=active');
  const view = render(<ToastProvider>Users</ToastProvider>);
  expect(screen.getByRole('alert')).toHaveTextContent('Rejected');
  expect(window.location.search).toBe('?filter=active');
  view.unmount();
  window.history.replaceState(null, '', '/login?error=locked');
  render(<ToastProvider>Login</ToastProvider>);
  expect(window.location.search).toBe('?error=locked');
  expect(navigation.replace).not.toHaveBeenCalled();
});
