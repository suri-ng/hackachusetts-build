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


describe('VerifyClient — pending human review', () => {
  it('shows owner-visible pending status and a withdrawal retry action', () => {
    const reviewData = {
      ...data,
      reviewStatus: {
        submissionId: '00000000-0000-0000-0000-0000000000b3',
        reviewId: '00000000-0000-0000-0000-0000000000d3',
        status: 'pending' as const,
        rationale: 'The evidence needs a closer look.',
        updatedAt: new Date().toISOString(),
      },
    };
    render(
      <VerifyClient
        data={reviewData}
        startFresh={false}
        fraudDemo={false}
        showReviewStatus
      />,
    );
    expect(screen.getByRole('heading', { name: /evidence is safely on hold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw and submit clearer photos/i })).toBeInTheDocument();
    expect(screen.getByText(/no reward issued/i)).toBeInTheDocument();
  });

  it('discloses exceptional authorized human inspection in live consent', async () => {
    window.localStorage.clear();
    render(
      <VerifyClient
        data={{ ...data, mode: 'supabase', aiMode: 'claude' }}
        startFresh
        fraudDemo={false}
      />,
    );
    expect(await screen.findByRole('dialog', { name: /let claude compare/i })).toHaveTextContent(
      /authorized sprout reviewer may inspect/i,
    );
  });
});


describe('VerifyClient — denied review recovery', () => {
  it('shows the retained denial rationale beside the new after-photo action', () => {
    const deniedData = {
      ...data,
      reviewStatus: {
        submissionId: data.pendingSubmissionId,
        status: 'denied' as const,
        rationale: 'The after photo did not clearly show the full area.',
        updatedAt: new Date().toISOString(),
      },
    };
    render(<VerifyClient data={deniedData} startFresh={false} fraudDemo={false} />);
    expect(screen.getByText(/reviewer requested clearer evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/did not clearly show the full area/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify my cleanup/i })).toBeInTheDocument();
  });
});
