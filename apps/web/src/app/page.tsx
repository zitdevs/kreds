import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Features } from "@/components/features";
import { LeaderboardShowcase } from "@/components/leaderboard-showcase";
import { Pricing } from "@/components/pricing";
import { SelfHosting } from "@/components/self-hosting";
import { License } from "@/components/license";
import { Community } from "@/components/community";
import { Sponsor } from "@/components/sponsor";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Features />
        <LeaderboardShowcase />
        <Pricing />
        <SelfHosting />
        <License />
        <Community />
        <Sponsor />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
