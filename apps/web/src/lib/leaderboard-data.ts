/** Sample data for the showcase section. Not real people. */

export type Row = {
  rank: number;
  member: string;
  kreds: number;
  prs: number;
  reviews: number;
  week: number;
  move: number;
  you?: boolean;
  note?: string;
};

export const rows: Row[] = [
  { rank: 1, member: "mariel-dev", kreds: 2180, prs: 38, reviews: 64, week: 285, move: 0 },
  { rank: 2, member: "tomas-r", kreds: 1745, prs: 31, reviews: 52, week: 310, move: 0 },
  { rank: 3, member: "shu-codes", kreds: 1480, prs: 27, reviews: 41, week: 190, move: 0 },
  {
    rank: 4,
    member: "ana-builds",
    kreds: 1015,
    prs: 19,
    reviews: 28,
    week: 240,
    move: 2,
    you: true,
  },
  {
    rank: 5,
    member: "dan-ships",
    kreds: 970,
    prs: 34,
    reviews: 6,
    week: 150,
    move: -1,
    note: "34 merged PRs, 6 reviews",
  },
  { rank: 6, member: "lu-park", kreds: 680, prs: 12, reviews: 18, week: 140, move: 1 },
];

export const feed = [
  { value: 25, who: "mariel-dev", what: "merged", target: "api#412", when: "4m" },
  { value: 15, who: "you", what: "reviewed", target: "web#188", when: "22m" },
  { value: 50, who: "shu-codes", what: "hit a 5-day streak", target: "", when: "1h" },
  { value: 10, who: "tomas-r", what: "got approved on", target: "infra#88", when: "2h" },
  { value: 15, who: "ana-builds", what: "reviewed", target: "api#437", when: "3h" },
];
