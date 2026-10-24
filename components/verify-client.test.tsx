import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// next/navigation must be mocked for client components in jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/verify',
}));

import { VerifyClient } from './verify-client';
import { getDemoSnapshot } from '@/lib/demo-store';

const data = getDemoSnapshot();

describe('VerifyClient — before stage (fresh start, no network)', () => {
  it('renders the before-first capture step and its integrity rationale', () => {
    render(<VerifyClient data={data} startFresh fraudDemo={false} />);
    expect(
      screen.getByRole('heading', { name: /show us the starting point/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/why before-first\?/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /lock in before photo/i }),
    ).toBeInTheDocument();
  });

  it('surfaces the private-proof assurance in the top bar', () => {
    render(<VerifyClient data={data} startFresh fraudDemo={false} />);
    expect(screen.getByText(/private proof/i)).toBeInTheDocument();
  });
});

describe('VerifyClient — after stage (pending submission)', () => {
  it('frames the legitimate after-photo comparison step', () => {
    render(<VerifyClient data={data} startFresh={false} fraudDemo={false} />);
    expect(
      screen.getByRole('heading', { name: /show the difference/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /verify my cleanup/i }),
    ).toBeInTheDocument();
  });

  it('frames the staged-fraud integrity stress test when fraudDemo is set', () => {
    render(<VerifyClient data={data} startFresh={false} fraudDemo />);
    expect(
      screen.getByRole('heading', { name: /integrity stress test/i }),
    ).toBeInTheDocument();
  });
});
