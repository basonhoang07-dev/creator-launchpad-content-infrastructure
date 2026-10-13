# The content-arena rubric

Every match in the arena is scored against this page. Each solution is a shortlist of content ideas
from a coaching call. The judge scores both solutions, `bracket.py` does the arithmetic, and the
higher weighted total goes through. The loser is out.

Score every idea against Akira's brand pillars (the pillars are in your brief, from pillars.md). A
solution's score is how well its ideas, taken together, meet each criterion.

## The five criteria

Each criterion is scored 0 to 10. The weight is how much of the 100-point total it is worth.

The first column is the score field: the exact key to use in the verdict JSON.

| score field | weight | the question |
| --- | --- | --- |
| pillar_fit | 30 | **Brand pillar fit.** Does each idea clearly map to ONE pillar in pillars.md? A stretch, or an idea that fits no pillar, scores low. |
| hook | 25 | **Hook strength.** Would a coach doing $20-50K/month stop scrolling in the first 3 seconds? Specific and tense beats generic. |
| proof | 20 | **Proof.** Is it grounded in a real quote or moment from the call? Any invented claim, stat or quote is a FATAL flaw. |
| icp_pain | 15 | **ICP pain.** Does it name a specific problem B2B coaches/founders actually have, not generic motivation? |
| clip_ability | 10 | **Clip-ability.** Can it be used straight from the real call footage? Needing a full re-script scores lower. |

Weighted total = (pillar_fit x 30 + hook x 25 + proof x 20 + icp_pain x 15 + clip_ability x 10) / 10.
That gives a number from 0 to 100.

## Anchors

Use the whole scale. A 7 is not a polite default.

**Brand pillar fit** (`pillar_fit`)
- 10: every idea maps cleanly to exactly one pillar, and you can name which.
- 7: one idea is a loose fit or straddles two pillars.
- 4: several ideas are stretches, or the main message is missing entirely.
- 0 to 2: the ideas fit no pillar, or contradict one (for example flexing, or pitching TOFU/MOFU/BOFU).

**Hook strength** (`hook`)
- 10: every hook is specific and tense: a coach at $20-50K/month would stop in the first 3 seconds.
- 7: strong overall, with one generic hook.
- 4: mostly generic hooks that could open anyone's video.
- 0 to 2: no real hook, or it opens on a slow setup.

**ICP pain** (`icp_pain`)
- 10: each idea names a concrete problem B2B coaches/founders ($20K-100K/month) actually have.
- 7: mostly concrete, one idea drifts into general motivation.
- 4: a lot of generic "mindset" or "hustle" with no named problem.
- 0 to 2: aimed at the wrong audience, or no problem at all.

**Proof** (`proof`)
- 10: every idea rests on a real quote or moment from the call, cited exactly, and every attack on
  the proof is fixed or correctly rebutted.
- 7: grounded, but one idea paraphrases loosely or one MINOR attack is still standing.
- 4: an idea leans on the call only vaguely, or a MAJOR attack is still standing.
- 0 to 2: an invented claim, stat or quote, or a FATAL attack still standing. Mark it fatal too.

A missing attack file means the opponent raised nothing. Score proof on the flaws you found yourself.

**Clip-ability** (`clip_ability`)
- 10: each idea can be cut straight from the real call footage, with the moment pointed to.
- 7: usable from the footage with a light re-record of the hook.
- 4: needs substantial re-scripting.
- 0 to 2: needs a full re-script; the call footage is no use for it.

## The fatal rule

Mark a solution `fatal` only when you have verified a flaw that makes it wrong or unusable for the
task. In this arena that always includes an invented claim, stat or quote: anything presented as
coming from the call that is not in the call. It also covers a hard constraint broken or the wrong
question answered. A fatal solution cannot beat a solution that is not fatal, whatever the totals
say. If both are fatal, the totals decide.

## Ties

There are no draws. On an exact tie, the solution with fewer attacks still standing wins. If that is
also level, the higher `pillar_fit` (brand pillar fit) score wins. If that is also level, pick the
one you would hand to Akira, and say why in the reason.

## What the judge does not reward

- **Length.** More ideas is not better. A tight shortlist of strong ideas beats a long list of weak
  ones.
- **Confidence.** A defense that says "fixed" is not proof. Check the revised solution, and check
  every quote against the call.
- **The approach.** The judge never sees the strategy cards and does not guess at them. It scores
  the work, not the method that produced it.
- **Talking about quality.** "This viral, high-converting hook" earns nothing. The hook has to be
  strong.
- **Agreement with the judge's own taste** where the pillars and the task do not ask for it.
