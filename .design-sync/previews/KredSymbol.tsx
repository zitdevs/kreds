import { KredSymbol } from "@kreds/ui";

export const WithAmounts = () => (
  <div className="flex flex-col gap-3 font-mono text-sm">
    <span className="text-amber inline-flex items-center gap-1">
      <KredSymbol size={13} />
      1,240.00
    </span>
    <span className="text-ink-dim inline-flex items-center gap-1">
      <KredSymbol size={13} tone="ink" />
      612.50
    </span>
    <span className="text-danger inline-flex items-center gap-1">
      <KredSymbol size={13} tone="ink" />
      −204.00
    </span>
  </div>
);

export const Sizes = () => (
  <div className="flex items-baseline gap-8 font-mono">
    <span className="text-amber inline-flex items-center gap-1 text-[13px]">
      <KredSymbol size={13} />
      18.00
    </span>
    <span className="text-amber inline-flex items-center gap-1 text-xl">
      <KredSymbol size={18} />
      18.00
    </span>
    <span className="text-amber inline-flex items-center gap-1 text-[26px]">
      <KredSymbol size={24} />
      18.00
    </span>
  </div>
);

export const InALedgerRow = () => (
  <div className="border-line bg-surface rounded-card border">
    <div className="border-line text-ink-faint flex items-center justify-between border-b px-4 py-2.5 font-mono text-xs tracking-wide uppercase">
      <span>kreds ledger --tail</span>
      <span>net</span>
    </div>
    <div className="text-ink-dim flex items-center justify-between px-4 py-2.5 font-mono text-sm">
      <span>api#128 merged</span>
      <span className="text-amber inline-flex items-center gap-1">
        <KredSymbol size={13} />
        18.00
      </span>
    </div>
    <div className="text-ink-dim flex items-center justify-between px-4 py-2.5 font-mono text-sm">
      <span>paid @mariel for her review</span>
      <span className="text-danger inline-flex items-center gap-1">
        <KredSymbol size={13} tone="ink" />
        12.00
      </span>
    </div>
  </div>
);
