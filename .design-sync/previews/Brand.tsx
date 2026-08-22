import { Brand } from "@kreds/ui";

export const Default = () => <Brand />;

export const CustomLabel = () => <Brand href="https://kreds.sh" label="Kreds Docs" />;

export const OnASurface = () => (
  <div className="border-line bg-surface rounded-card flex items-center justify-between border px-5 py-4">
    <Brand />
    <span className="text-ink-faint font-mono text-xs tracking-wide uppercase">kreds.sh</span>
  </div>
);
