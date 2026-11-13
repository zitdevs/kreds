import type { ReactNode, Ref } from "react";
import { Cross } from "@kreds/ui";

type Tone = "info" | "success" | "error";

const tones: Record<Tone, string> = {
  info: "border-line-strong bg-surface",
  success: "border-accent-deep bg-accent-wash",
  error: "border-danger/60 bg-danger/5",
};

interface NoticeProps {
  readonly tone?: Tone;
  readonly title?: string;
  readonly children: ReactNode;
  /** Trailing controls, such as a retry. */
  readonly action?: ReactNode;
  readonly onDismiss?: () => void;
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * A short message about something that just happened or just went wrong.
 *
 * Not a live region by itself: whether it should interrupt a screen reader
 * depends on where it is used, so the caller wraps it in one when it should.
 * `tabIndex={-1}` lets a caller move focus to it after a redirect, without
 * putting it in the tab order.
 */
export function Notice({ tone = "info", title, children, action, onDismiss, ref }: NoticeProps) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`rounded-card flex gap-3 border-l-2 p-4 text-sm leading-relaxed ${tones[tone]}`}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="text-ink font-medium">{title}</p> : null}
        <div className={`text-ink-dim ${title ? "mt-1" : ""}`}>{children}</div>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-ink-dim hover:text-ink -m-2 grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
        >
          <Cross className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
