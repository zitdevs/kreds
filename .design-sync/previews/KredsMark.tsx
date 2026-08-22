import { KredsMark } from "@kreds/ui";

export const Sizes = () => (
  <div className="flex items-end gap-6">
    <KredsMark size={16} />
    <KredsMark size={20} />
    <KredsMark size={24} />
    <KredsMark size={32} />
    <KredsMark size={48} />
  </div>
);

export const Tones = () => (
  <div className="flex items-center gap-8">
    <KredsMark size={32} tone="accent" />
    <KredsMark size={32} tone="ink" />
  </div>
);

export const Lockup = () => (
  <div className="flex items-center gap-6">
    <span className="flex items-center gap-2.5">
      <KredsMark size={20} />
      <span className="text-ink text-[0.95rem] font-semibold tracking-tight">Kreds</span>
    </span>
    <span className="border-line bg-surface rounded-card flex items-center gap-2.5 border px-4 py-3">
      <KredsMark size={24} />
      <span className="text-ink text-base font-semibold tracking-tight">Kreds</span>
      <span className="border-line text-ink-faint rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide">
        docs
      </span>
    </span>
  </div>
);
