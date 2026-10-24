'use client';

import confetti from 'canvas-confetti';

export function celebrate(): void {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#84a258', '#f1bd55', '#7d5f49', '#dcebc8', '#ffffff'];
  confetti({
    particleCount: 70,
    spread: 68,
    origin: { x: 0.5, y: 0.58 },
    colors,
    scalar: 0.9,
    gravity: 0.85,
    ticks: 180,
  });
  window.setTimeout(() => {
    confetti({ particleCount: 36, angle: 55, spread: 48, origin: { x: 0.06, y: 0.7 }, colors, scalar: 0.75 });
    confetti({ particleCount: 36, angle: 125, spread: 48, origin: { x: 0.94, y: 0.7 }, colors, scalar: 0.75 });
  }, 180);
}
