import { Eyebrow } from "@kreds/ui";

export const Default = () => <Eyebrow>How it works</Eyebrow>;

export const AboveAHeading = () => (
  <div className="max-w-xl">
    <Eyebrow>Pricing</Eyebrow>
    <h2 className="text-ink mt-3 text-3xl font-semibold tracking-tight">Free while it is small.</h2>
    <p className="text-ink-dim mt-4 text-base leading-relaxed">
      The eyebrow is the only place the accent green is used as type, which is what makes it read as
      a label rather than a link.
    </p>
  </div>
);

export const Labels = () => (
  <div className="flex flex-col gap-3">
    <Eyebrow>Features</Eyebrow>
    <Eyebrow>Self-hosting</Eyebrow>
    <Eyebrow>Open source</Eyebrow>
  </div>
);
