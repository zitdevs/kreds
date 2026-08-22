import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import type { GitHubInstallationId } from "@kreds/domain";

import type { Env } from "../config/env.js";
import { readPrivateKey } from "./private-key.js";

const GITHUB_API = "https://api.github.com";

/**
 * Nine minutes. GitHub rejects an App JWT with an `exp` more than ten minutes
 * out, and the shorter window leaves room for clock skew between us and them.
 */
const JWT_TTL_SECONDS = 9 * 60;
/** Backdated a minute, for the same skew in the other direction. */
const JWT_BACKDATE_SECONDS = 60;

const accessToken = z.object({
  token: z.string().min(1),
  expires_at: z.string(),
});

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * The Kreds GitHub App, authenticating as itself and as its installations.
 *
 * Implemented against GitHub's endpoints with `node:crypto` rather than through
 * Octokit, for the same reason the OAuth service is: the whole of it is one
 * RS256 JWT and one POST, and an SDK would be a larger dependency than the code
 * it replaces. The JWT is assembled by hand here because it is three
 * base64url segments and a signature, and every JWT library in the ecosystem
 * carries an algorithm-confusion history that this has no room for.
 *
 * Nothing here caches an installation token. They last an hour, and a cache
 * that outlives a suspended installation would keep acting on an account that
 * has revoked us.
 */
@Injectable()
export class GitHubAppService {
  private readonly logger = new Logger(GitHubAppService.name);
  private readonly appId: string | undefined;
  private readonly privateKey: KeyObject | null;

  constructor(config: ConfigService<Env, true>) {
    this.appId = config.get("GITHUB_APP_ID", { infer: true });
    this.privateKey = this.loadKey(config.get("GITHUB_APP_PRIVATE_KEY", { infer: true }));
  }

  /**
   * Whether this instance has a usable App.
   *
   * Both halves must be present and the key must actually parse. A configured
   * app id with a mangled key is not "configured", and reporting it as such
   * would turn a startup problem into a confusing runtime one.
   */
  get isConfigured(): boolean {
    return this.appId !== undefined && this.privateKey !== null;
  }

  private loadKey(raw: string | undefined): KeyObject | null {
    if (!raw) return null;
    const pem = readPrivateKey(raw);
    if (!pem) {
      this.logger.error(
        "GITHUB_APP_PRIVATE_KEY is set but is not a PEM private key, in plain, escaped or base64 form. The GitHub App is disabled.",
      );
      return null;
    }
    try {
      return createPrivateKey(pem);
    } catch (error) {
      // The message names the decoder failure, never the key material.
      this.logger.error(
        `GITHUB_APP_PRIVATE_KEY could not be parsed: ${(error as Error).message}. The GitHub App is disabled.`,
      );
      return null;
    }
  }

  /**
   * A JWT proving we are the App itself.
   *
   * Used only to ask for installation tokens. It grants nothing on any
   * repository, which is why the App-level identity and the installation-level
   * one are kept separate rather than one long-lived credential.
   */
  private appJwt(): string {
    if (!this.appId || !this.privateKey) {
      throw new ServiceUnavailableException("This Kreds instance has no GitHub App configured.");
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
      JSON.stringify({
        iat: now - JWT_BACKDATE_SECONDS,
        exp: now + JWT_TTL_SECONDS,
        iss: this.appId,
      }),
    );

    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    return `${header}.${payload}.${signer.sign(this.privateKey, "base64url")}`;
  }

  /**
   * A token scoped to one installation, valid for about an hour.
   *
   * Minted on demand and returned to the caller rather than stored. See the
   * class comment: a stored token outlives the permission that produced it.
   */
  async installationToken(id: GitHubInstallationId): Promise<string> {
    const response = await fetch(`${GITHUB_API}/app/installations/${id}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.appJwt()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kreds",
      },
    });

    if (!response.ok) {
      // The status is the useful part and carries no secret. The body can
      // echo request details, so it is not logged.
      this.logger.warn(`GitHub refused an installation token for ${id}: ${response.status}`);
      throw new ServiceUnavailableException("GitHub refused an installation token.");
    }

    const parsed = accessToken.safeParse(await response.json());
    if (!parsed.success) {
      throw new ServiceUnavailableException("GitHub returned a token Kreds could not read.");
    }
    return parsed.data.token;
  }
}
