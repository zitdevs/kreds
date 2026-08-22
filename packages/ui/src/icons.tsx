import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/**
 * One consistent icon set: 24px grid, 1.6 stroke, round caps and joins.
 * Drawn rather than pulled from a package so the whole site ships one style
 * and no bytes we don't use.
 */
function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function GitHub(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.21-3.37-1.21-.46-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

export const Check = (p: IconProps) => (
  <Base {...p} strokeWidth={2}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);

export const Cross = (p: IconProps) => (
  <Base {...p} strokeWidth={2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);

export const Terminal = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 17 6-5-6-5M12 19h8" />
  </Base>
);

export const GitMerge = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M6 9v6M18 9a3 3 0 0 0-3-3H9" />
    <circle cx="18" cy="7.5" r="1.5" />
  </Base>
);

export const Eye = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);

export const Flame = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 22c4 0 7-2.7 7-6.5 0-4.5-4-6-4-9.5-2 .8-3 2.4-3 4-1.4-.6-2-2-2-3.5C7.5 8.5 5 11 5 15.5 5 19.3 8 22 12 22Z" />
  </Base>
);

export const Trophy = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3M9 20h6M12 14v6" />
  </Base>
);

export const Bolt = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Base>
);

export const Target = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" />
  </Base>
);

export const Server = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Base>
);

export const Plug = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8ZM12 17v5" />
  </Base>
);

export const Chart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Base>
);

export const Shield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2.5 4.5 5.6v5.6c0 4.6 3.1 8.9 7.5 10.3 4.4-1.4 7.5-5.7 7.5-10.3V5.6L12 2.5Z" />
    <path d="m9.2 12 2 2 3.6-3.8" />
  </Base>
);

export const Heart = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20s-7.5-4.4-7.5-9.5a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z" />
  </Base>
);

export const Book = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22V4.5Z" />
    <path d="M8 7h8M8 11h5" />
  </Base>
);

export const Users = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16.5 5.2a3.2 3.2 0 0 1 0 5.9M18 20a6.4 6.4 0 0 0-2.2-4.8" />
  </Base>
);

export const Chevron = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const Sparkle = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3 1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3Z" />
  </Base>
);
