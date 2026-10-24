import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Sprout — Small actions, verified impact',
    template: '%s · Sprout',
  },
  description:
    'Complete local environmental missions, earn rewards, and turn verified action into sponsor-funded community impact.',
  applicationName: 'Sprout',
  keywords: ['climate action', 'verified impact', 'community cleanup', 'rewards'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#f7f6f0',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
