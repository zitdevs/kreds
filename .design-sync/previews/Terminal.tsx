import { Terminal, Button } from "@kreds/ui";

export const Sizes = () => (
  <div className="text-ink flex items-end gap-6">
    <Terminal className="h-4 w-4" />
    <Terminal className="h-5 w-5" />
    <Terminal className="h-6 w-6" />
    <Terminal className="h-8 w-8" />
  </div>
);

export const Tones = () => (
  <div className="flex items-center gap-6">
    <Terminal className="text-ink h-6 w-6" />
    <Terminal className="text-ink-dim h-6 w-6" />
    <Terminal className="text-accent h-6 w-6" />
    <Terminal className="text-amber h-6 w-6" />
  </div>
);

export const InContext = () => (
  <div className="flex flex-wrap items-center gap-5">
    <span className="text-ink-dim inline-flex items-center gap-2 text-sm">
      <Terminal className="text-accent h-4 w-4" />
      Inline with body text
    </span>
    <Button href="#" variant="secondary">
      <Terminal className="h-4 w-4" />
      In a button
    </Button>
  </div>
);
