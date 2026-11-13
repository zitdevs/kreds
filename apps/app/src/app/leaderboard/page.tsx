import type { Metadata } from "next";

import { Leaderboard } from "@/features/leaderboard/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Everyone on Kreds, ranked by Contribution Points for verified work.",
};

export default function LeaderboardPage() {
  return <Leaderboard />;
}
