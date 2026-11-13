"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ActionButton } from "@kreds/ui";

interface RevokeDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Resolves when access is revoked; rejects with a message to show. */
  readonly onConfirm: () => Promise<void>;
}

/**
 * The confirmation in front of "Revoke access".
 *
 * A native modal `<dialog>`: it traps focus, closes on Escape, makes the page
 * behind it inert and returns focus to the button that opened it, all without
 * code here to get wrong. "Keep access" takes initial focus so a stray Enter
 * keeps things as they were.
 */
export function RevokeDialog({ open, onClose, onConfirm }: RevokeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  // `open` is React state; whether the dialog is modal is the browser's. This
  // keeps the second in step with the first.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const [error, submit] = useActionState(async (): Promise<string | null> => {
    try {
      await onConfirm();
      onClose();
      return null;
    } catch (failure) {
      return failure instanceof Error ? failure.message : "Access was not revoked. Try again.";
    }
  }, null);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="revoke-title"
      aria-describedby="revoke-description"
      className="rounded-card border-line-strong bg-bg-elev text-ink backdrop:bg-bg/80 m-auto w-[calc(100%-2rem)] max-w-md border p-6 shadow-2xl backdrop:backdrop-blur-sm"
    >
      <h2 id="revoke-title" className="text-lg font-semibold tracking-tight">
        Revoke Kreds&apos; access?
      </h2>
      <p id="revoke-description" className="text-ink-dim mt-3 text-sm leading-relaxed">
        Kreds stops reading new activity on your behalf. Contributions it has already recorded stay
        on your record. You can connect again at any time.
      </p>

      {error ? (
        <p role="alert" className="text-danger mt-4 text-sm">
          {error}
        </p>
      ) : null}

      <form action={submit} className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ActionButton variant="secondary" size="lg" onClick={onClose} autoFocus>
          Keep access
        </ActionButton>
        <ConfirmButton />
      </form>
    </dialog>
  );
}

/** Its own component because `useFormStatus` reads the form it is rendered inside. */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <ActionButton type="submit" variant="danger" size="lg" disabled={pending} aria-busy={pending}>
      {pending ? "Revoking…" : "Revoke access"}
    </ActionButton>
  );
}
