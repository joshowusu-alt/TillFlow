'use client';

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback: ReactNode;
  /** Optional label for diagnostics — never shown to owners. */
  section?: string;
};

type State = { hasError: boolean };

/**
 * Isolates a deferred Owner Home section so a loader failure cannot blank the page.
 * Does not render technical exception messages.
 */
export default class HomeSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally no owner-facing detail; server logs may still capture RSC errors.
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
