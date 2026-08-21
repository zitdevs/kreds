export type Plan = {
  id: string;
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  cta: string;
  href: string;
  featured?: boolean;
  inherits?: string;
  features: string[];
};

export const plans: Plan[] = [
  {
    id: "community",
    name: "Community",
    price: "$0",
    cadence: "forever",
    blurb: "Everything a small team needs to make contribution visible.",
    cta: "Get started",
    href: "https://kreds.sh/signup",
    features: [
      "Up to 20 members",
      "1 team",
      "Unlimited repositories",
      "GitHub integration",
      "PR merged, review and issue tracking",
      "Weekly, monthly and all-time leaderboards",
      "Activity feed",
      "Kreds and streaks",
      "Basic achievements",
      "Up to 3 custom achievements",
      "1 active challenge",
      "Basic reward configuration",
      "30 days of analytics",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$2.99",
    cadence: "per member / month",
    blurb: "For teams that want the whole thing, priced per person.",
    cta: "Start free trial",
    href: "https://kreds.sh/signup?plan=team",
    featured: true,
    inherits: "Community",
    features: [
      "Unlimited members",
      "Unlimited achievements",
      "Unlimited challenges",
      "Advanced Kreds rules",
      "Seasons",
      "Full analytics history",
      "Slack and Discord integrations",
      "Linear and Jira integrations",
      "API access",
      "Webhooks",
      "Exports",
      "Multiple squads and groups",
      "Better admin controls",
    ],
  },
  {
    id: "growing",
    name: "Growing",
    price: "$79",
    cadence: "per month, flat",
    blurb: "Same as Team, flat rate. Cheaper from 27 people up.",
    cta: "Choose Growing",
    href: "https://kreds.sh/signup?plan=growing",
    inherits: "Team",
    features: [
      "Up to 50 members",
      "Flat pricing, no per-seat math",
      "Everything in Team",
      "Predictable invoice as you hire",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    blurb: "For 50+ engineers and the paperwork that comes with them.",
    cta: "Talk to us",
    href: "mailto:hello@zitdevs.com?subject=Kreds%20Enterprise",
    inherits: "Growing",
    features: [
      "50+ members",
      "SSO and SAML",
      "SCIM provisioning",
      "Audit logs",
      "Advanced permissions",
      "Dedicated support and SLA",
      "Private cloud or on-premise",
      "Security and compliance review",
    ],
  },
];
