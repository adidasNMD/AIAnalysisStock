import type { SVGProps } from 'react';

type ShellIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function IconFrame({ size = 18, children, ...props }: ShellIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function Orbit(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-24 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(24 12 12)" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function Crosshair(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </IconFrame>
  );
}

export function Radar(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12l6-5" />
      <path d="M12 4v2" />
      <path d="M12 18v2" />
    </IconFrame>
  );
}

export function Database(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </IconFrame>
  );
}

export function Clock(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </IconFrame>
  );
}

export function HistoryClock(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 7v5h5" />
      <path d="M4.8 12A7.5 7.5 0 1 0 7 6.6L4 9" />
      <path d="M12 8v4l2.8 1.8" />
    </IconFrame>
  );
}

export function CalendarClock(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4 8h16" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <circle cx="13" cy="14" r="3" />
      <path d="M13 12.5v1.8l1.2.8" />
    </IconFrame>
  );
}

export function ShieldCheck(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" />
      <path d="m8.8 12 2.1 2.1 4.3-4.5" />
    </IconFrame>
  );
}

export function Eye(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M2.8 12s3.2-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.2 5.5-9.2 5.5S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconFrame>
  );
}

export function FileSearch(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="11" cy="14" r="2.4" />
      <path d="m13 16 2.2 2.2" />
    </IconFrame>
  );
}

export function SettingsIcon(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
      <path d="M4 12h5" />
      <path d="M13 12h7" />
      <circle cx="11" cy="12" r="2" />
    </IconFrame>
  );
}

export function Sliders(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 6h8" />
      <path d="M16 6h4" />
      <circle cx="14" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h11" />
      <path d="M19 18h1" />
      <circle cx="17" cy="18" r="2" />
    </IconFrame>
  );
}

export function Zap(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M13 2 5 14h7l-1 8 8-12h-7l1-8z" />
    </IconFrame>
  );
}

export function AlertTriangle(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 2.8 19h18.4L12 3z" />
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
    </IconFrame>
  );
}

export function RefreshCw(props: ShellIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 10A7 7 0 0 0 6 7.5L4 11" />
      <path d="M5.5 14A7 7 0 0 0 18 16.5l2-3.5" />
    </IconFrame>
  );
}
