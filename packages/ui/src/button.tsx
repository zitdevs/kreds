import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-[#04140c] hover:bg-[#7cf0b7]",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-[#3a4552] hover:bg-surface-hi",
  ghost: "text-ink-dim hover:text-ink",
  // Destructive, and quiet about it until hovered: a revoke should never be
  // the loudest thing on a screen.
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:border-danger/70 hover:bg-danger/15",
};

const sizes: Record<Size, string> = {
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-[0.95rem]",
};

interface StyleProps {
  variant?: Variant;
  size?: Size;
}

/**
 * The classes behind both button components, for the rare element that has to
 * look like a button without being either one.
 */
export function buttonClassName({ variant = "primary", size = "md" }: StyleProps = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

type Props = ComponentProps<typeof Link> &
  StyleProps & {
    children: ReactNode;
  };

/** Navigation that looks like a button. It goes somewhere, so it is a link. */
export function Button({ variant, size, className = "", children, ...props }: Props) {
  return (
    <Link className={`${buttonClassName({ variant, size })} ${className}`} {...props}>
      {children}
    </Link>
  );
}

type ActionProps = ComponentProps<"button"> & StyleProps;

/**
 * An action that looks like a button, and is one.
 *
 * Separate from `Button` rather than a prop on it, because the two differ in
 * semantics, not styling: a link moves the person, a button changes something
 * in place. `type` defaults to "button" so one dropped inside a form never
 * submits it by accident.
 */
export function ActionButton({
  variant,
  size,
  className = "",
  type = "button",
  ...props
}: ActionProps) {
  return (
    <button
      type={type}
      className={`${buttonClassName({ variant, size })} ${className}`}
      {...props}
    />
  );
}
