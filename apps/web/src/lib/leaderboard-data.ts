/**
 * Sample data for the showcase. Not real people.
 *
 * The two boards disagree on purpose: dan-ships leads contribution and trails
 * the economy. That is not a bug in the data, it is Law XXV: specialising in
 * shipping is legitimate work, and it still leaves a review deficit to fund.
 */

export type EconomyRow = {
  rank: number;
  member: string;
  net: number;
  funded: number;
  received: number;
  you?: boolean;
  inDebt?: boolean;
};

/** Ranked by KRED net position (balance minus outstanding debt). */
export const economy: EconomyRow[] = [
  { rank: 1, member: "mariel-dev", net: 1240, funded: 62, received: 41 },
  { rank: 2, member: "tomas-r", net: 980, funded: 48, received: 39 },
  { rank: 3, member: "shu-codes", net: 612, funded: 37, received: 33 },
  { rank: 4, member: "ana-builds", net: 318, funded: 24, received: 28, you: true },
  { rank: 5, member: "lu-park", net: 96, funded: 15, received: 22 },
  { rank: 6, member: "dan-ships", net: -204, funded: 6, received: 58, inDebt: true },
];

export type PointsRow = { rank: number; member: string; points: number; you?: boolean };

/** Ranked by Contribution Points. Cumulative, never spent, never converted. */
export const contribution: PointsRow[] = [
  { rank: 1, member: "dan-ships", points: 14920 },
  { rank: 2, member: "mariel-dev", points: 13480 },
  { rank: 3, member: "tomas-r", points: 11240 },
  { rank: 4, member: "shu-codes", points: 9860 },
  { rank: 5, member: "ana-builds", points: 7410, you: true },
  { rank: 6, member: "lu-park", points: 5120 },
];

export const feed = [
  {
    value: "+18.00 K",
    who: "mariel-dev",
    what: "merged",
    target: "api#412",
    when: "4m",
    mint: true,
  },
  {
    value: "-12.00 K",
    who: "you",
    what: "paid shu-codes for reviewing",
    target: "web#188",
    when: "22m",
  },
  { value: "+11.76 K", who: "tomas-r", what: "reviewed", target: "infra#88", when: "1h" },
  { value: "+34 pts", who: "ana-builds", what: "reviewed", target: "api#437", when: "3h" },
  {
    value: "+0.00 K",
    who: "dependabot",
    what: "opened",
    target: "web#190",
    when: "5h",
    zero: true,
  },
];
