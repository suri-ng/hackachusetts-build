import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundedBar } from './funded-bar';
import type { CampaignView } from '@/lib/domain';

const campaign: CampaignView = {
  id: 'c1',
  sponsorName: 'MASSPIRG',
  sponsorMark: 'MP',
  sponsorLabel: 'Illustrative sponsor campaign',
  title: 'Clean Amherst Common',
  location: 'Amherst, MA',
  pool: 500,
  threshold: 100,
  progress: 37,
  milestones: [25, 50, 75, 100],
  poolUnlocked: false,
  basePoints: 80,
  pointsMultiplier: 2,
  endsLabel: 'Weekend boost',
};

describe('FundedBar', () => {
  it('renders an accessible progressbar reflecting progress and threshold', () => {
    render(<FundedBar campaign={campaign} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '37');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
  });

  it('shows the unlocked dollar amount proportional to progress', () => {
    // 500 * (37/100) = 185
    render(<FundedBar campaign={campaign} />);
    expect(screen.getByText('$185')).toBeInTheDocument();
    expect(screen.getByText(/of \$500 unlocked/)).toBeInTheDocument();
  });

  it('labels the next milestone relative to current progress', () => {
    render(<FundedBar campaign={campaign} />);
    // next marker above 37 is 50 => 13 more
    expect(screen.getByText(/13 more to the 50 milestone/)).toBeInTheDocument();
  });

  it('honors an overridden progress value (the animated 37 -> 38 beat)', () => {
    render(<FundedBar campaign={campaign} progress={38} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '38');
  });
});
