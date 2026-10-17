import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StorefrontSmsSettings from './StorefrontSmsSettings';
afterEach(cleanup);

it('submits the saved On choice while closed and keeps edits through repeated collapse', () => {
  const { container } = render(<form><StorefrontSmsSettings enabled senderId="SHOP" provider="Arkesel" /></form>);
  const form = container.querySelector('form')!;
  const section = screen.getByRole('button', { name: /SMS notifications/ });
  expect(section).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('SMS On')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(new FormData(form).get('smsNotificationsEnabled')).toBe('on');
  expect(new FormData(form).get('smsSenderId')).toBe('SHOP');
  fireEvent.click(section);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enable SMS order notifications' }));
  fireEvent.change(screen.getByLabelText(/Custom sender ID/), { target: { value: 'NEW SHOP' } });
  fireEvent.click(section);
  expect(screen.getByText('SMS Off')).toBeVisible();
  expect(new FormData(form).get('smsSettingsIncluded')).toBe('1');
  expect(new FormData(form).has('smsNotificationsEnabled')).toBe(false);
  expect(new FormData(form).get('smsSenderId')).toBe('NEW SHOP');
  fireEvent.click(section);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByLabelText(/Custom sender ID/)).toHaveValue('NEW SHOP');
});
it('shows Off initially and allows an explicit On choice to survive collapse', () => {
  const { container } = render(<form><StorefrontSmsSettings enabled={false} senderId={null} provider="Hubtel" /></form>);
  expect(screen.getByText('SMS Off')).toBeVisible();
  const section = screen.getByRole('button', { name: /SMS notifications/ });
  fireEvent.click(section);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(section);
  expect(screen.getByText('SMS On')).toBeVisible();
  expect(new FormData(container.querySelector('form')!).get('smsNotificationsEnabled')).toBe('on');
});
it('does not send an Off instruction when the provider is unavailable', () => {
  const { container } = render(<form><StorefrontSmsSettings enabled senderId={null} provider={null} /></form>);
  fireEvent.click(screen.getByRole('button', { name: /SMS notifications/ }));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  const data = new FormData(container.querySelector('form')!);
  expect(data.has('smsSettingsIncluded')).toBe(false);
  expect(data.has('smsNotificationsEnabled')).toBe(false);
});
