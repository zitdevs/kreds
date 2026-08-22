import { ArrowRight, Button, GitHub, Heart } from "@kreds/ui";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button href="#get-started">Get started</Button>
    <Button href="#docs" variant="secondary">
      Read the docs
    </Button>
    <Button href="#changelog" variant="ghost">
      Changelog
    </Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button href="#install" size="md">
      Install Kreds
    </Button>
    <Button href="#install" size="lg">
      Install Kreds
    </Button>
  </div>
);

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button href="#start" size="lg">
      Start the leaderboard
      <ArrowRight className="h-4 w-4" />
    </Button>
    <Button href="https://github.com/zitdevs/kreds" variant="secondary" size="lg">
      <GitHub className="h-4 w-4" />
      Star on GitHub
    </Button>
    <Button href="#sponsor" variant="ghost">
      <Heart className="h-4 w-4" />
      Sponsor
    </Button>
  </div>
);
