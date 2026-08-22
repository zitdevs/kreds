import { z } from "zod";

/**
 * The shapes Kreds reads out of GitHub's webhook payloads.
 *
 * Deliberately narrow. GitHub sends a great deal per delivery and these
 * schemas name only the fields that are acted on, so that a change to
 * something unread cannot fail a delivery, and so that reading this file tells
 * you exactly what Kreds knows about you.
 *
 * Every schema is permissive about unknown keys and strict about the ones it
 * names. A missing `id` is a payload we cannot act on; an unexpected extra
 * field is GitHub shipping a feature.
 */

/** A repository as it appears inside an installation payload. */
export const webhookRepository = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  private: z.boolean(),
  /** Present on the `repository` event, absent inside installation payloads. */
  default_branch: z.string().min(1).optional(),
});

export type WebhookRepository = z.infer<typeof webhookRepository>;

/**
 * The account an App is installed on.
 *
 * GitHub's `type` is `"Organization"` or `"User"`, and the distinction decides
 * whether a Kreds Team exists at all (02), so it is required rather than
 * inferred from the presence of other fields.
 */
export const webhookAccount = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  type: z.string().min(1),
});

export const webhookInstallation = z.object({
  id: z.number().int().positive(),
  account: webhookAccount,
});

export const installationEvent = z.object({
  action: z.string().min(1),
  installation: webhookInstallation,
  repositories: z.array(webhookRepository).optional(),
});

export const installationRepositoriesEvent = z.object({
  action: z.string().min(1),
  installation: webhookInstallation,
  repositories_added: z.array(webhookRepository).optional(),
  repositories_removed: z.array(webhookRepository).optional(),
});

export const repositoryEvent = z.object({
  action: z.string().min(1),
  installation: z.object({ id: z.number().int().positive() }).optional(),
  repository: webhookRepository,
});

/**
 * Map GitHub's account type onto the domain's.
 *
 * Anything that is not an organization is treated as a personal account, which
 * is the safe direction: a personal installation forms no Team and therefore no
 * organization economy, so an unrecognised type cannot accidentally create one.
 */
export function accountTypeOf(type: string): "ORGANIZATION" | "USER" {
  return type.toLowerCase() === "organization" ? "ORGANIZATION" : "USER";
}
