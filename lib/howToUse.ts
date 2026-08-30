// lib/howToUse.ts
//
// The walkthroughs on /how-to-use, kept in code rather than the database.
//
// This is documentation of the product, not client data: it changes when a
// feature changes, in the same commit as the feature, and it should be the
// same for everyone. Putting it in Postgres would mean a migration to fix a
// typo and a way for it to drift out of sync with the app it describes.
//
// `narration` is the script the voiceover reads, and it doubles as the
// written walkthrough for anyone who'd rather read than watch — which is
// most people looking something up in a hurry. Keeping one source for both
// is what stops the page and the audio disagreeing.

export interface Walkthrough {
  slug: string;
  title: string;
  // One or two lines: what this part of the app is for, and when to open it.
  summary: string;
  // Read aloud in the voiceover and shown as the written version. Written to
  // be spoken — short sentences, no bullet syntax, no UI jargon a client
  // wouldn't use out loud.
  narration: string;
  // Where the walkthrough happens, so a card can deep-link to it.
  href: string;
}

export const WALKTHROUGHS: Walkthrough[] = [
  {
    slug: "home",
    title: "Your dashboard",
    summary: "Where you land: what you've earned this month, what's due today, and anything waiting on you.",
    href: "/",
    narration:
      "This is your home page, and it's built to answer one question — what needs doing right now. " +
      "At the top you'll see what you've earned this month against your goal, so you always know where you stand without opening a spreadsheet. " +
      "Below that is what's due today: the scripts that need writing and the shoots that are booked in. " +
      "Needs You Now is the important one. Anything your coach assigned on a call ends up there, so if you only look at one thing before you start the day, look at that.",
  },
  {
    slug: "calendar",
    title: "Content calendar",
    summary: "Every concept, script and shoot for each brand — and the plan for when you're filming them.",
    href: "/calendar",
    narration:
      "The content calendar is where the work actually lives. Each brand you're signed to gets its own board, and every video moves through it in order — an idea first, then a script, then filmed, then posted. " +
      "The script table is the main view. You can drag a row up or down to reorder your week, assign an editor, and open any concept to write it. " +
      "Availability is worth setting up early. Block out the times you can't film and the app will schedule around them instead of putting a shoot on a day you're at work.",
  },
  {
    slug: "breakdown",
    title: "Break down a reference video",
    summary: "Paste a Reel or TikTok that's working and get the transcript plus the framework behind it.",
    href: "/calendar",
    narration:
      "If you've ever watched a video go viral and thought, I want to make that but for my brand — this is that button. " +
      "Paste the link into the Breakdown tab and it pulls the full transcript, then breaks the video into its four beats: the hook, the intention, the body, and the lesson. " +
      "Each beat comes back as a fill-in-the-blank template you can drop your own story into, with an explanation of why that beat holds attention. " +
      "It also tells you what you can't borrow — if the video worked because that creator had a number or a credential you don't, it says so, and tells you what to put in that slot instead.",
  },
  {
    slug: "brand-deals",
    title: "Brand deals",
    summary: "Every open brand offer in one place, with what it pays and who to message.",
    href: "/opportunities",
    narration:
      "Brand deals get posted in Discord and then scroll away, so if you weren't online you never saw them. This page keeps them. " +
      "Each card shows what one post pays, how often you can post, and what that adds up to in a month, so you can tell at a glance whether a deal is worth your time. " +
      "Open a deal and you'll see the bonus ladder — what a video is worth if it hits ten thousand views, or a hundred thousand, or a million. " +
      "When you want one, hit the DM button. That takes you straight to the person who posted it, because these deals are arranged with them directly, not through us.",
  },
  {
    slug: "kpi",
    title: "KPI tracker",
    summary: "Your rates, your caps, and how much you've actually made — per brand and per month.",
    href: "/kpi",
    narration:
      "The KPI tracker is your money view. Add each brand you're signed to with what they pay per video and how many videos a month you're allowed, and it works out what the month is worth. " +
      "Log what you actually earn as you go, and the numbers on your home page update with it. " +
      "There's also a planner that works backwards: tell it what you want to make in a month and it tells you how many videos that takes at your current rates.",
  },
  {
    slug: "workload",
    title: "Filming needs",
    summary: "Everything you're due to film, grouped so you can batch it in one session.",
    href: "/workload",
    narration:
      "Filming needs is the page to open before you shoot. " +
      "It shows every concept that's scripted and waiting on you, grouped so you can film them in one sitting instead of setting up your camera five times a week. " +
      "Each one carries its script and the notes attached to it, so you're not switching between tabs while you're on camera.",
  },
  {
    slug: "recaps",
    title: "Call recaps",
    summary: "What was said on every coaching call, and what you agreed to do next.",
    href: "/recaps",
    narration:
      "After every call with your coach, a recap lands here — a summary, the decisions you made, and the action items with dates on them. " +
      "Those action items are the same ones that show up in Needs You Now on your home page, so nothing agreed on a call quietly disappears. " +
      "It's also the place to go when you can't remember what you decided three weeks ago.",
  },
  {
    slug: "integrations",
    title: "Integrations",
    summary: "Connect your calendar and the tools that power the AI features.",
    href: "/integrations",
    narration:
      "Two things worth connecting here. " +
      "Google Calendar, so your shoots land in the calendar you actually check, and so the app knows when you're busy before it schedules anything. " +
      "And SocialKit, which is what pulls transcripts when you break down a reference video. It's free, it takes about a minute, and the breakdown tool won't work without it.",
  },
];

export function findWalkthrough(slug: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.slug === slug);
}
