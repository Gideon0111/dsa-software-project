export const events = [
  {
    id: "evt-101",
    title: "Lagos Jazz Night",
    city: "Lagos",
    venue: "Terra Kulture, Victoria Island",
    startsAt: "2027-03-20T19:00:00Z",
    status: "PUBLISHED",
    description: "An evening of live jazz featuring Lagos' finest musicians.",
    tiers: [
      { id: "tier-101-a", name: "General", priceCents: 250000, capacity: 120, sold: 30 },
      { id: "tier-101-b", name: "VIP", priceCents: 500000, capacity: 40, sold: 40 }, // sold out
    ],
  },
  {
    id: "evt-102",
    title: "Abuja Tech Meetup",
    city: "Abuja",
    venue: "Nice Vista Hub, Wuse 2",
    startsAt: "2027-04-05T14:00:00Z",
    status: "PUBLISHED",
    description: "Monthly tech community meetup with talks and networking.",
    tiers: [
      { id: "tier-102-a", name: "Early Bird", priceCents: 150000, capacity: 80, sold: 10 },
      { id: "tier-102-b", name: "Standard", priceCents: 250000, capacity: 100, sold: 5 },
    ],
  },
  {
    id: "evt-103",
    title: "Port Harcourt Food Festival",
    city: "Port Harcourt",
    venue: "Le Meridien Ogeyi Place",
    startsAt: "2027-04-18T12:00:00Z",
    status: "PUBLISHED",
    description: "Celebrate Rivers State cuisine with vendors, music and cooking demos.",
    tiers: [
      { id: "tier-103-a", name: "General Admission", priceCents: 300000, capacity: 200, sold: 200 }, // sold out
      { id: "tier-103-b", name: "VIP Tasting", priceCents: 700000, capacity: 30, sold: 8 },
    ],
  },
  {
    id: "evt-104",
    title: "Lagos Comedy Showcase",
    city: "Lagos",
    venue: "Freedom Park",
    startsAt: "2027-05-02T19:00:00Z",
    status: "PUBLISHED",
    description: "Stand-up comedy night with rising Nigerian comedians.",
    tiers: [
      { id: "tier-104-a", name: "General", priceCents: 200000, capacity: 150, sold: 12 },
      { id: "tier-104-b", name: "VIP", priceCents: 400000, capacity: 25, sold: 3 },
    ],
  },
  {
    id: "evt-105",
    title: "Kaduna Arts & Crafts Fair",
    city: "Kaduna",
    venue: "Kaduna Trade Fair Complex",
    startsAt: "2027-05-15T10:00:00Z",
    status: "PUBLISHED",
    description: "Local artisans, handmade crafts, live art and food stalls.",
    tiers: [
      { id: "tier-105-a", name: "Entry", priceCents: 100000, capacity: 300, sold: 45 },
    ],
  },
  {
    id: "evt-106",
    title: "Ibadan Open Mic Night",
    city: "Ibadan",
    venue: "The Dome, Dugbe",
    startsAt: "2027-05-28T18:00:00Z",
    status: "PUBLISHED",
    description: "Open mic for poets, musicians and spoken-word artists.",
    tiers: [
      { id: "tier-106-a", name: "General", priceCents: 120000, capacity: 60, sold: 60 }, // sold out
    ],
  },
];
