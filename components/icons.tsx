import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'mission'
  | 'camera'
  | 'impact'
  | 'arrowRight'
  | 'arrowLeft'
  | 'leaf'
  | 'sparkles'
  | 'check'
  | 'shield'
  | 'clock'
  | 'location'
  | 'upload'
  | 'lock'
  | 'gift'
  | 'star'
  | 'reset'
  | 'eye'
  | 'duplicate'
  | 'route'
  | 'chevron'
  | 'info'
  | 'cleanup'
  | 'bottle'
  | 'bike'
  | 'garden'
  | 'wallet'
  | 'users'
  | 'trend';

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
  mission: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h3"/><path d="m14.5 17 1.4 1.4 3.1-3.1"/></>,
  camera: <><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="4"/></>,
  impact: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m3 7 6-4 6 5 6-5"/></>,
  arrowRight: <><path d="M5 12h14M14 6l6 6-6 6"/></>,
  arrowLeft: <><path d="M19 12H5M10 6l-6 6 6 6"/></>,
  leaf: <><path d="M19.5 4.5C12 4.2 5.2 7.4 5 14.2c-.1 3.2 2.4 5.7 5.6 5.3 6.6-.8 8.1-8.3 8.9-15Z"/><path d="M4 21c2-5 6-8.7 11-11"/></>,
  sparkles: <><path d="m12 2 1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  shield: <><path d="M12 2 4.5 5v6.5c0 4.9 3.2 8.6 7.5 10.5 4.3-1.9 7.5-5.6 7.5-10.5V5L12 2Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M4 14v6h16v-6"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  gift: <><path d="M3 9h18v12H3zM12 9v12M2 5h20v4H2z"/><path d="M12 5H8.5A2.5 2.5 0 1 1 11 2.5L12 5ZM12 5h3.5A2.5 2.5 0 1 0 13 2.5L12 5Z"/></>,
  star: <path d="m12 2.5 2.9 5.8 6.4.9-4.6 4.5 1.1 6.3-5.8-3-5.8 3 1.1-6.3L2.7 9.2l6.4-.9L12 2.5Z"/>,
  reset: <><path d="M20 8a8.5 8.5 0 1 0 1 7"/><path d="M20 3v5h-5"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  duplicate: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>,
  route: <><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h4a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  cleanup: <><path d="M8 3h8l-1 5H9L8 3ZM6 8h12l-1 13H7L6 8Z"/><path d="M4 8h16M10 12v5M14 12v5"/></>,
  bottle: <><path d="M9 2h6v4l2 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3V2ZM9 6h6M7 12h10"/></>,
  bike: <><circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="m6 17 4-8h4l4 8M9 11h7M12 17 9 11 7 7h3"/></>,
  garden: <><path d="M12 22V10"/><path d="M12 15c-5 0-7-3-7-7 5 0 7 3 7 7ZM12 12c0-5 3-7 7-7 0 5-3 7-7 7Z"/><path d="M6 22h12"/></>,
  wallet: <><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z"/><path d="M3 7V5a2 2 0 0 1 2-2h13v4M16 11h5v4h-5a2 2 0 1 1 0-4Z"/></>,
  users: <><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 5.7V21"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
};

export function Icon({
  name,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function SproutMark({ size = 40 }: { size?: number }) {
  return (
    <span className="sprout-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size} fill="none">
        <rect width="40" height="40" rx="13" fill="currentColor" />
        <path d="M20 30V18" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M19.5 20C13 20 10 16.6 10 11c6.4 0 9.5 3.5 9.5 9Z" fill="white" />
        <path d="M20.5 17C27 17 30 13.8 30 8.5c-6.4 0-9.5 3.2-9.5 8.5Z" fill="#DDEBC9" />
        <path d="M15 30h10" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
