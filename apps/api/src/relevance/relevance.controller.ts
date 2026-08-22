import { BadRequestException, Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { RelevanceService } from "./relevance.service.js";

/**
 * What a repository's public history looks like.
 *
 * Everything served here is derived from signals GitHub already shows the
 * world, so publishing it discloses nothing new. What is deliberately absent is
 * any trust tier, multiplier or eligibility: those gate Official issuance and
 * are decided from signals this side cannot see.
 */
@Controller("relevance")
export class RelevanceController {
  constructor(private readonly relevance: RelevanceService) {}

  @Get(":gitHubRepositoryId")
  async forRepository(@Param("gitHubRepositoryId") raw: string) {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException("A GitHub repository id is a positive integer.");
    }

    const relevance = await this.relevance.forRepository(id);
    if (!relevance) {
      // Absence rather than a score of zero. "Kreds has not measured this" and
      // "this repository has no history" are different facts, and reporting the
      // first as the second would be a judgement Kreds has not earned.
      throw new NotFoundException("Kreds has no relevance measurement for that repository.");
    }
    return relevance;
  }
}
