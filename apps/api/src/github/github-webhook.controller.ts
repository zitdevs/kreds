import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { Env } from "../config/env.js";
import { InstallationService } from "./installation.service.js";
import { isSignatureValid, SIGNATURE_HEADER } from "./webhook-signature.js";

/**
 * Where GitHub tells Kreds what happened.
 *
 * The single most security-sensitive endpoint in the product. Everything
 * downstream, contributions, scores and eventually money, is built on the
 * assumption that what arrives here is genuine, so nothing gets past the
 * signature check.
 *
 * The response is deliberately fast and boring. GitHub gives a webhook ten
 * seconds and marks the endpoint unhealthy if it is slow, so this acknowledges
 * the delivery and does no work that could be deferred.
 */
@Controller("github")
export class GitHubWebhookController {
  private readonly logger = new Logger(GitHubWebhookController.name);
  private readonly secret: string | undefined;

  constructor(
    private readonly installations: InstallationService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("GITHUB_WEBHOOK_SECRET", { infer: true });
  }

  // `webhook`, singular, because that is the path already published in
  // `.env.example` and the self-hosting guide. Anyone who followed those docs
  // has it configured on their App, and a second spelling would strand them
  // debugging a configuration that is correct.
  @Post("webhook")
  @HttpCode(202)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-github-event") eventType?: string,
    @Headers("x-github-delivery") deliveryId?: string,
  ): Promise<{ delivery: string | null; outcome: string }> {
    if (!this.secret) {
      // 503 rather than 401: the caller did nothing wrong, this instance is
      // not finished being set up. GitHub retries a 503 and gives up on a 401,
      // and after an admin finishes configuring the App the retry is what
      // recovers the missed deliveries.
      throw new ServiceUnavailableException("This Kreds instance has no GitHub App configured.");
    }

    if (!isSignatureValid(request.rawBody, request.header(SIGNATURE_HEADER), this.secret)) {
      // No detail, on purpose. Distinguishing "no signature" from "wrong
      // signature" tells a forger which half to work on.
      this.logger.warn(`Rejected an unsigned or mis-signed delivery ${deliveryId ?? "unknown"}.`);
      throw new UnauthorizedException("Invalid signature.");
    }

    if (!eventType) throw new UnauthorizedException("Missing event type.");

    // Parsed from the raw bytes rather than from `request.body`, so that the
    // thing acted on is exactly the thing that was signed.
    let payload: unknown;
    try {
      payload = JSON.parse(request.rawBody?.toString("utf8") ?? "null");
    } catch {
      throw new UnauthorizedException("Body was not JSON.");
    }

    const outcome = await this.installations.handle(eventType, payload);
    return { delivery: deliveryId ?? null, outcome };
  }
}
