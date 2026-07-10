import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import WelcomeLoading from '@/app/welcome/loading';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('welcome route loading boundary', () => {
  it('returns no UI so the public page is not wrapped in authenticated launch splash', () => {
    const { container } = render(React.createElement(WelcomeLoading));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render authenticated cold-start copy', () => {
    render(React.createElement(WelcomeLoading));
    expect(screen.queryByText(/Opening your business/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checking your session and sync status/i)).not.toBeInTheDocument();
  });

  it('does not import RootLaunchLoading or AppLaunchLoading', () => {
    const source = read('app/welcome/loading.tsx');
    expect(source).not.toContain('RootLaunchLoading');
    expect(source).not.toContain('AppLaunchLoading');
    expect(source).not.toContain('Opening your business');
    expect(source).not.toContain('Checking your session');
  });
});
