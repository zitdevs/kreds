import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-[#04140c] hover:bg-[#7cf0b7]",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-[#3a4552] hover:bg-surface-hi",
  ghost: "text-ink-dim hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-[0.95rem]",
};

type Props = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: Props) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
