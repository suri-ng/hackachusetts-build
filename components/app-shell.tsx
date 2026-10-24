'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { DataMode } from '@/lib/domain';
import { Icon, SproutMark, type IconName } from './icons';

const nav: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/mission', label: 'Mission', icon: 'mission' },
  { href: '/verify', label: 'Verify', icon: 'camera' },
  { href: '/impact', label: 'Impact', icon: 'impact' },
];

export function AppShell({
  children,
  points,
  mode,
}: {
  children: React.ReactNode;
  points: number;
  mode: DataMode;
}) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand-lockup" aria-label="Sprout home">
            <SproutMark size={38} />
            <span>sprout</span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {nav.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={active ? 'nav-link active' : 'nav-link'}>
                  {active && <motion.span layoutId="nav-active" className="nav-active-pill" />}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="header-actions">
            <span className={mode === 'supabase' ? 'demo-chip live-stack' : 'demo-chip'}><span className="demo-dot" /> {mode === 'supabase' ? 'Supabase live' : mode === 'fallback-demo' ? 'Fallback demo' : 'Seeded demo'}</span>
            <Link href="/impact" className="points-pill" aria-label={`${points.toLocaleString()} Sprout points`}>
              <Icon name="leaf" size={17} />
              <strong>{points.toLocaleString()}</strong>
            </Link>
            <Link href="/impact" className="avatar" aria-label="Open Alex's impact profile">AM</Link>
          </div>
        </div>
      </header>
      <main id="main-content" className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? 'mobile-nav-link active' : 'mobile-nav-link'}>
              <span className="mobile-nav-icon"><Icon name={item.icon} size={21} /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
