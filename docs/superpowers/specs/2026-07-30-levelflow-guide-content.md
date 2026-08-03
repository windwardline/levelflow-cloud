# Levelflow Guide — Content Deck (Stage 3.5)

The authoritative copy for the rebuilt Guide. The build renders this deck
verbatim; edits here are owner-review territory. It merges the former
Guide and About tabs, keeps only what survives the Desk, and rewrites
every line to be jargon-free while matching the words a user actually
sees on TradingView (charts), TradeLocker (orders), and E8 (their
account). The two old teaching asides that named outside jargon
("TP1", "the runner") are deliberately gone: the platforms don't use
those words, so neither do we.

Language rules: languageGuard bans stay in force; "pending" for unfilled
orders; the canonical two-target instruction appears once, verbatim, as
the centerpiece callout. "R" appears in the product (trade progress,
Insights results), so the Guide defines it plainly in Vocabulary.

Absorption map — every line of today's Guide and today's About tab
(`OverviewPanel.tsx`) is either carried, rewritten, or deliberately
dropped:

| Today's content | Fate |
| --- | --- |
| About: one focused answer / clears stale setups / "no setup" honesty | §1 |
| About: checks in one pass (direction, location, volatility, session, news, rates, past results) | §1 |
| About: correlation rule (linked markets → stronger kept) | §1 |
| About: everything shown together before you act; does not place trades | §1 |
| About: limit orders only | §2 |
| About: default chart 1 hour; review 4H/1H/15M; price check 5M/1M | §8 |
| About: learning shared across Levelflow | §7 |
| About: "premium workspace" positioning copy | dropped — marketing, not guidance |
| Guide: how-review-works steps | §1 + §3, recast for the Desk |
| Guide: targets-and-stops (incl. "TP1"/"runner" teaching asides) | §2, asides deleted — platforms don't use those words |
| Guide: stop placement (structure + buffer, no round numbers) | §2 |
| Guide: confidence tiers | §5, rewritten for the earned-confidence engine |
| Guide: cost ratings (four tiers incl. the blocking one) | §6 |
| Guide: replay record, money-positive counting, weak-record rule | §7 |
| Guide: timeframes | §8 |
| — | new: §3 platform walk-through, §4 current trades, §9 market hours, §10 vocabulary |

---

## 1. What Levelflow does

Levelflow reviews a market and gives you one answer: the strongest
current setup, or nothing. When the evidence is not there, "nothing" is
the honest result — a stale setup is cleared, not left on screen.

Every review checks the same things: direction, where price sits, how
much the market is moving, the trading session, scheduled news, interest
rates, closely linked markets, and how setups like this one actually
ended in the past. If two linked markets qualify at the same moment,
Levelflow keeps the stronger one.

When a setup qualifies, everything you need sits together before you
act: the side, all four prices, the confidence score, and the reason in
plain words.

Levelflow reviews markets. It does not place trades. You take every
trade yourself, on your own platform, and everything here is built
around making those few clicks precise.

## 2. The setup, level by level

A setup is four prices, named the way your platform names them:

- **Entry** — where your limit order waits. A buy limit waits below the
  current price; a sell limit waits above it. Levelflow only ever
  suggests limit orders — never market or stop entries.
- **Stop loss** — the price that says the setup was wrong. Levelflow
  places it past the surrounding price structure with a volatility
  buffer, never at a round number.
- **Target 1 · bank half** — the first profit level. When price reaches
  it, you act (see §3).
- **Target 2 · take-profit** — the level your take-profit order sits at.
  It is chosen from price structure and what this market can actually
  reach in the setup's window.

Each value on the Desk copies individually — tap it, paste it into the
matching field on your platform.

## 3. Taking and managing the trade

> **Set your take-profit at Target 2. When price reaches Target 1,
> close half and move your stop to your entry — profit locked either
> way.**

In platform terms, that is three moments:

1. **Place the trade.** Open a buy or sell limit at the Entry price. Set
   the stop loss and set the take-profit at Target 2. Until price
   reaches your entry, the order shows as **pending** — nothing to do.
2. **Target 1 hits.** Close half the position (a partial close), and
   modify the stop loss to your entry price. Half your profit is real
   money now, and the rest of the trade can no longer cost you anything.
3. **The finish.** The remaining half either reaches Target 2 — your
   take-profit closes it — or comes back to your entry and closes flat.
   Profit either way. That is the whole design.

Your platform will not do step 2 for you. Levelflow keeps the levels on
screen in Current trades so the two moves take seconds.

## 4. Following your trades

Current trades shows every trade that still needs you — **pending**
(order placed, not filled) or **open** (filled, live) — with the step to
take right now, computed from where the trade actually is when you look.
When a trade finishes, it leaves Current trades; Insights keeps the
complete record, including setups you never took. That record is yours,
per broker, and it is how you judge Levelflow on results rather than
promises.

## 5. Confidence

Every setup carries a score out of 100. It is not a mood — it is the
engine's estimate of setup strength, and each market type must clear its
own qualifying bar before a setup is shown at all. The bar differs by
market because the evidence differs by market: where history proves the
score separates strong setups from weak ones, the bar is high and the
number means more; where history shows setups succeed at similar rates
across scores, the bar is set to let the record speak instead. The meter
under the score shows the bar, so you always know how much room a setup
cleared it by.

## 6. Costs

Spread is the gap between buying and selling price on your platform, and
it is paid out of your profit. Levelflow sizes it against the setup
before showing anything:

- **Clean** — costs are small next to the distance between entry and
  stop. The payoff survives intact.
- **Acceptable** — costs take a visible bite. The payoff still holds up.
- **Thin** — costs take a meaningful share. Usually worth waiting for a
  better spread.

When costs eat too much of the payoff, the setup is not shown at all.

## 7. The record

Levelflow's history claims are measured, not promised. Every market
type's record comes from replaying its full available price history —
for the major currency pairs, more than a decade — and counting setups
the way a trade actually pays: take-profit reached, half banked at
Target 1, or a finish that closed in profit. Any finish that ended in
profit counts as **money-positive**; every other finish counts against
the record.

Below 55% money-positive, Levelflow treats a market's record as weak:
scans stop offering it, and if you review it directly, the setup says
so plainly. You can still trade it — the history just is not on your
side.

Finished setups across all of Levelflow feed back into future reviews,
so the product learns from the whole record, not one person at a time.

## 8. Timeframes

The chart view you pick — 1 minute, 5 minutes, 15 minutes, 1 hour, 4
hours, 1 day, the same intervals you know from TradingView — controls what you see, not what
Levelflow checks. Every review reads the 4-hour, 1-hour, and 15-minute
charts together for direction, location, and quality, then validates the
latest price on the 5-minute and 1-minute charts when they are
available. The 1-hour default is a balanced place to read a setup.

## 9. When a market is closed

Grey in the scan menu means closed. The label on the row tells you
exactly when it opens next — "OPENS 5:00P SUN" — in your own local
time. Most markets close for the weekend and reopen Sunday afternoon or
evening; crypto never closes. Scans skip closed markets automatically,
and the scanned count only ever counts markets that were actually
checked.

## 10. Glossary

(Retitled from "What the words mean here" — owner copy, 2026-08-03.)

- **Bank half** — close half your position and take that profit now.
- **Move your stop to your entry** — edit the stop-loss order to the
  price you entered at. From there, the worst case for what remains is
  breaking even.
- **Pending** — your order is placed but has not filled. Nothing to do.
- **Payoff** — what the setup pays at Target 2 measured against what it
  risks at the stop. A payoff of 2:1 risks one to make two.
- **Money-positive** — any finished setup that ended in profit,
  whichever level it reached.
- **R** — profit or loss measured against what you risked. +1R means
  you made exactly what you were risking; −1R means the stop loss did
  its job.
