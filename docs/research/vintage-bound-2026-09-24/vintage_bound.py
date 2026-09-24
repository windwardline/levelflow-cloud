#!/usr/bin/env python3
"""Vintage bound for Levelflow Cloud, zero provider bytes.

How far does the choice between the minute bank's FIRST COPIES and FMP's
REVISED 5-minute history (the calibration cache) move a synthetic trade?

Reads only:
  <repo>/.minute-bank/<provider>.jsonl
  <repo>/.calibration-cache/<provider>-5min-7000.rolling.json
  <repo>/docs/research/r3/capture-all-classfolds-2026-09-14.jsonl.manifest.json
  ~/Library/Logs/levelflow-minute-bank.log (the capture-lag tables only)
Every file is opened with mode "r". Nothing is written anywhere; stdout only.
Standard library only. No network.
"""

import collections
import hashlib
import json
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# The checkout this file sits in: docs/research/vintage-bound-2026-09-24/ is three levels down.
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
BANK = f"{REPO}/.minute-bank"
CACHE = f"{REPO}/.calibration-cache"
MANIFEST = f"{REPO}/docs/research/r3/capture-all-classfolds-2026-09-14.jsonl.manifest.json"

UTC = timezone.utc
WS = int(datetime(2026, 8, 4, tzinfo=UTC).timestamp() * 1000)   # window start, inclusive
WE = int(datetime(2026, 8, 26, tzinfo=UTC).timestamp() * 1000)  # window end, exclusive
MIN = 60_000
B5 = 5 * MIN
DAY = 86_400_000

# venues.ts VENUE_CLOCKS / labelZoneFor: every other provider symbol is New York.
LABEL_ZONES = {"^GDAXI": "Europe/Berlin", "^N225": "Asia/Tokyo", "^AXJO": "Australia/Sydney"}
DEFAULT_ZONE = "America/New_York"

REL_TOL = 1e-9                  # brief: exact to 1e-9 relative
OFFSETS = (-B5, 0, B5)          # label offsets tested in step 1
CLEAN_SHARE = 0.50              # JUDGED threshold (brief); sensitivity at 0.30 and 0.70
SENSITIVITY = (0.30, 0.50, 0.70)
OUTAGE_MIN_GAP = 60 * MIN       # judged: a roster-wide hole this long is a bank outage
MISSING_DAY_MIN_BARS = 12       # judged: a day counts only if the other vintage has >= 1 h of bars
MISSING_DAY_SHARE = 0.50        # judged: below this coverage the day is missing
MIN_COMPARED = 100              # judged: fewer compared buckets than this cannot be called clean

DECISION_HOURS = (0, 4, 8, 12, 16, 20)
ATR_BARS = 14
FORWARD = 96
FORWARD_MIN_HELD = 90
BRACKETS_K = (0.5, 1.0, 2.0)


def fmt_t(ms):
    return datetime.fromtimestamp(ms / 1000, UTC).strftime("%Y-%m-%dT%H:%MZ")


def rel_eq(a, b):
    return abs(a - b) <= REL_TOL * max(abs(a), abs(b))


def sign(x):
    return (x > 0) - (x < 0)


def bank_path(provider):
    return f"{BANK}/{provider.replace('^', '%5E')}.jsonl"


def cache_path(provider):
    return f"{CACHE}/{provider}-5min-7000.rolling.json"


def stat_fingerprint(path):
    st = os.stat(path)
    return (st.st_size, st.st_mtime_ns)


# ---------------------------------------------------------------- readers

_offset_cache = {}


def label_to_utc_ms(label, zone_name):
    """bars.ts toTimestamp for an intraday label: the wall clock in `zone`.

    zoneinfo with fold=0. The window holds no DST transition in any of the
    four zones (US: Mar/Nov, EU: Mar/Oct, Sydney: Apr/Oct, Tokyo: none);
    load_bank asserts fold=0 and fold=1 agree for every converted label, so
    toTimestamp's gap/overlap resolution is never exercised.
    """
    y, mo, d = int(label[0:4]), int(label[5:7]), int(label[8:10])
    h, mi, s = int(label[11:13]), int(label[14:16]), int(label[17:19])
    key = (zone_name, y, mo, d, h)
    off = _offset_cache.get(key)
    if off is None:
        z = ZoneInfo(zone_name)
        a = datetime(y, mo, d, h, 0, 0, tzinfo=z, fold=0).utcoffset()
        b = datetime(y, mo, d, h, 0, 0, tzinfo=z, fold=1).utcoffset()
        if a != b:
            raise SystemExit(f"DST-ambiguous label {label} in {zone_name}: refusing to guess")
        off = int(a.total_seconds() * 1000)
        _offset_cache[key] = off
    naive = int(datetime(y, mo, d, h, mi, s, tzinfo=UTC).timestamp() * 1000)
    return naive - off


def load_bank(provider):
    """First copy of each key, window minutes only, keyed by UTC ms.

    Also returns diagnostics: lines read, unparseable lines (a torn tail from
    a concurrent writer would land here), repeated keys, window minutes that
    were appended more than 72 h after the file's newest earlier date (i.e.
    not captured live), and incoherent OHLC minutes kept as-is.
    """
    zone = LABEL_ZONES.get(provider, DEFAULT_ZONE)
    path = bank_path(provider)
    fp_before = stat_fingerprint(path)
    first = {}
    lines = bad = repeats = late = 0
    running_max = ""
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            lines += 1
            try:
                row = json.loads(line)
                label = row["date"]
                vals = (float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"]))
            except (ValueError, KeyError, TypeError):
                bad += 1
                continue
            if label in first:
                repeats += 1
                continue
            first[label] = vals
            # late-append census: a label far older than what the file already held
            if running_max and label < running_max:
                gap_h = (datetime.strptime(running_max, "%Y-%m-%d %H:%M:%S")
                         - datetime.strptime(label, "%Y-%m-%d %H:%M:%S")).total_seconds() / 3600
                if gap_h > 72 and "2026-08-02" <= label < "2026-08-28":
                    late += 1
            if label > running_max:
                running_max = label
    fp_after = stat_fingerprint(path)
    minutes = {}
    incoherent = 0
    for label, v in first.items():
        # cheap label prefilter: every zone here is within 14 h of UTC
        if not ("2026-08-02" <= label < "2026-08-28"):
            continue
        t = label_to_utc_ms(label, zone)
        if WS <= t < WE:
            if t % MIN:
                raise SystemExit(f"{provider}: bank minute {label} not on a minute boundary")
            o, h, l, c = v
            if h < l or h < max(o, c) or l > min(o, c) or l <= 0:
                incoherent += 1
            minutes[t] = v
    diag = dict(lines=lines, bad=bad, repeats=repeats, late=late, incoherent=incoherent,
                changed=(fp_before != fp_after))
    return minutes, diag


def build_buckets(minutes):
    """5-minute buckets (UTC floor) from bank minutes; complete buckets only."""
    groups = collections.defaultdict(list)
    for t, v in minutes.items():
        groups[t - t % B5].append((t, v))
    complete = {}
    touched = set(groups)
    for b, lst in groups.items():
        if len(lst) != 5:
            continue
        lst.sort()
        complete[b] = (lst[0][1][0],
                       max(x[1][1] for x in lst),
                       min(x[1][2] for x in lst),
                       lst[-1][1][3])
    return complete, touched


def load_cache(provider):
    path = cache_path(provider)
    fp_before = stat_fingerprint(path)
    with open(path, "r", encoding="utf-8") as fh:
        store = json.load(fh)
    fp_after = stat_fingerprint(path)
    clock = store.get("clock")
    items = store["items"]
    first_t = items[0]["time"] if items else None
    last_t = items[-1]["time"] if items else None
    lo = WS - 3 * DAY  # ATR lookback margin
    bars = {}
    off_grid = 0
    for it in items:
        t = it["time"]
        if lo <= t < WE:
            if t % B5:
                off_grid += 1
                continue
            bars[t] = (float(it["open"]), float(it["high"]), float(it["low"]), float(it["close"]))
    pinned = store.get("pinned")
    del store, items
    return bars, dict(clock=clock, first=first_t, last=last_t, off_grid=off_grid,
                      pinned=pinned, changed=(fp_before != fp_after))


# ---------------------------------------------------------------- capture lag

BANK_LOG = os.path.expanduser("~/Library/Logs/levelflow-minute-bank.log")


def read_run_log():
    """Successful bank runs per provider symbol, from the bank's own run log.

    A run block runs from 'run starting' to the next one. A symbol succeeded in
    a block that reached 'run complete', did not say 'Nothing was fetched', and
    printed no failure line for that symbol ('  SYMBOL: ...'). Returns
    (first_logged_run_ms, {provider: sorted success start times}) or None.
    """
    if not os.path.exists(BANK_LOG):
        return None
    blocks = []
    cur = None
    with open(BANK_LOG, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.endswith("minute-bank run starting"):
                cur = dict(start=line[:20], complete=False, nothing=False, failed=set())
                blocks.append(cur)
            elif cur is None:
                continue
            elif line.endswith(")") and "minute-bank run complete" in line:
                cur["complete"] = True
            elif line.startswith("Nothing was fetched"):
                cur["nothing"] = True
            elif line.startswith("  ") and ":" in line:
                cur["failed"].add(line.strip().split(":")[0])
    def ms(stamp):
        return int(datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC).timestamp() * 1000)
    ok = [b for b in blocks if b["complete"] and not b["nothing"]]
    return ms(blocks[0]["start"]), ok, ms


LAG_CLASSES = ((0, 6, "< 6 h"), (6, 12, "6-12 h"), (12, 24, "12-24 h"), (24, 48, "24-48 h"),
               (48, 10_000, ">= 48 h"))


def make_lag_of(provider, runlog):
    """Estimated capture lag (h) of the bank's first copy of a bucket ending at `end_ms`:
    the first logged successful run for this symbol that started at or after the bucket's
    end. None when the bucket ended before the first logged run (captured by an unlogged
    run; the bank already held 45 MB when the log begins)."""
    import bisect
    if runlog is None:
        return lambda end_ms: None
    first_ms, ok, ms = runlog
    starts = sorted(ms(b["start"]) for b in ok if provider not in b["failed"])
    def lag_of(end_ms):
        if end_ms < first_ms:
            return None
        i = bisect.bisect_left(starts, end_ms)
        return (starts[i] - end_ms) / 3_600_000 if i < len(starts) else None
    return lag_of


def lag_class(h):
    if h is None:
        return "pre-log"
    for lo, hi, name in LAG_CLASSES:
        if lo <= h < hi:
            return name
    return ">= 48 h"


# ---------------------------------------------------------------- step 1

def construction(bank_b, cache_bars):
    per_offset = {}
    for off in OFFSETS:
        n = all4 = close = 0
        for b, v in bank_b.items():
            w = cache_bars.get(b + off)
            if w is None or not (WS <= b + off < WE):
                continue
            n += 1
            e = [rel_eq(v[i], w[i]) for i in range(4)]
            all4 += all(e)
            close += e[3]
        per_offset[off] = (n, all4, close)
    # best offset: highest all-four share; ties resolve to 0, then to -5
    def share(off):
        n, a, _ = per_offset[off]
        return a / n if n else -1.0
    best = max(OFFSETS, key=lambda o: (share(o), o == 0, o < 0))
    # per-day all-four share at offset 0 (construction proven on any one day?)
    per_day = collections.defaultdict(lambda: [0, 0])
    for b, v in bank_b.items():
        w = cache_bars.get(b)
        if w is None:
            continue
        dkey = b // DAY
        per_day[dkey][0] += 1
        per_day[dkey][1] += all(rel_eq(v[i], w[i]) for i in range(4))
    best_day = max((a / n for n, a in per_day.values() if n >= MISSING_DAY_MIN_BARS), default=0.0)
    return per_offset, best, best_day, per_day


def range_width(bank_b, cache_bars):
    """Counts over compared buckets (offset 0): bank high above / below the cache high,
    bank low below / above the cache low (beyond the 1e-9 tolerance)."""
    c = collections.Counter()
    for b, v in bank_b.items():
        w = cache_bars.get(b)
        if w is None:
            continue
        c["n"] += 1
        if not rel_eq(v[1], w[1]):
            c["hi_wider" if v[1] > w[1] else "hi_narrower"] += 1
        if not rel_eq(v[2], w[2]):
            c["lo_wider" if v[2] < w[2] else "lo_narrower"] += 1
    return c


def exact_by_lag(bank_b, cache_bars, lag_of):
    out = collections.defaultdict(lambda: [0, 0])
    for b, v in bank_b.items():
        w = cache_bars.get(b)
        if w is None:
            continue
        c = lag_class(lag_of(b + B5))
        out[c][0] += 1
        out[c][1] += all(rel_eq(v[i], w[i]) for i in range(4))
    return dict(out)


# ---------------------------------------------------------------- step 2

def resolve(path, ref, unit, side):
    """path: list of (o,h,l,c) held forward buckets, in order. unit = stop distance.

    Stop and target sit `unit` from `ref` (symmetric brackets, so +1R/-1R).
    A bucket touching both counts as the stop. Touch = at or through the level.
    Unresolved: last held close, signed, over the stop distance.
    Returns (outcome_R, kind, slot, both): kind in T/S/E, slot = the resolving
    bucket's position in the held path (1-based; 0 when unresolved), both = it
    touched both levels.
    """
    if side > 0:
        stop, target = ref - unit, ref + unit
        for j, (_, h, l, _) in enumerate(path, 1):
            if l <= stop:
                return -1.0, "S", j, h >= target
            if h >= target:
                return 1.0, "T", j, False
    else:
        stop, target = ref + unit, ref - unit
        for j, (_, h, l, _) in enumerate(path, 1):
            if h >= stop:
                return -1.0, "S", j, l <= target
            if l <= target:
                return 1.0, "T", j, False
    return side * (path[-1][3] - ref) / unit, "E", 0, False


def brackets_for(bank_b, cache_bars, cache_times_sorted, lag_of):
    """All synthetic brackets for one symbol. Returns list of dict rows."""
    import bisect
    rows = []
    skipped = collections.Counter()
    day = WS
    while day < WE:
        for hour in DECISION_HOURS:
            t = day + hour * 3_600_000
            if not (WS <= t < WE):
                continue
            if t not in cache_bars or t not in bank_b:
                skipped["decision bucket not held"] += 1
                continue
            slots = [t + j * B5 for j in range(1, FORWARD + 1)]
            slots = [s for s in slots if s < WE]
            cpath = [cache_bars[s] for s in slots if s in cache_bars]
            bpath = [bank_b[s] for s in slots if s in bank_b]
            if len(cpath) < FORWARD_MIN_HELD or len(bpath) < FORWARD_MIN_HELD:
                skipped["forward < 90 of 96 held"] += 1
                continue
            i = bisect.bisect_right(cache_times_sorted, t)
            if i < ATR_BARS:
                skipped["fewer than 14 cache bars for ATR"] += 1
                continue
            atr_ts = cache_times_sorted[i - ATR_BARS:i]
            atr = sum(cache_bars[s][1] - cache_bars[s][2] for s in atr_ts) / ATR_BARS
            if not atr > 0:
                skipped["ATR not positive"] += 1
                continue
            ref_b = bank_b[t][3]
            ref_c = cache_bars[t][3]
            held_differ = set(s for s in slots if s in cache_bars) != set(s for s in slots if s in bank_b)
            for k in BRACKETS_K:
                unit = k * atr
                for side in (1, -1):
                    oc, kc, jc, bc = resolve(cpath, ref_c, unit, side)
                    ob, kb, jb, bb = resolve(bpath, ref_b, unit, side)
                    obp, kbp, _, _ = resolve(bpath, ref_c, unit, side)  # cache ref+ATR, bank path
                    rows.append(dict(t=t, k=k, side=side, oc=oc, kc=kc, ob=ob, kb=kb,
                                     obp=obp, kbp=kbp, held_differ=held_differ,
                                     jc=jc, jb=jb, bc=bc, bb=bb, lag=lag_of(t + B5),
                                     atr_span_h=(atr_ts[-1] - atr_ts[0]) / 3_600_000))
        day += DAY
    return rows, skipped


def summarize(ds, obs, ocs):
    n = len(ds)
    if n == 0:
        return None
    q = statistics.quantiles(ds, n=100, method="inclusive") if n >= 2 else [ds[0]] * 99
    return dict(
        n=n,
        nonzero=sum(1 for d in ds if d != 0) / n,
        signdiff=sum(1 for a, b in zip(obs, ocs) if sign(a) != sign(b)) / n,
        mean=sum(ds) / n,
        medabs=statistics.median(abs(d) for d in ds),
        p1=q[0], p5=q[4], p95=q[94], p99=q[98],
        sum=sum(ds),
        abs100=100 * sum(abs(d) for d in ds) / n,
    )


STAT_HEAD = (f"{'n':>6} {'d!=0':>6} {'sgn!=':>6} {'mean d':>8} {'med|d|':>7} "
             f"{'p1':>7} {'p5':>7} {'p95':>7} {'p99':>7} {'sum d':>9} {'|d|/100':>8}")


def stat_line(s):
    return (f"{s['n']:>6} {s['nonzero']:>6.1%} {s['signdiff']:>6.1%} {s['mean']:>+8.4f} "
            f"{s['medabs']:>7.4f} {s['p1']:>+7.3f} {s['p5']:>+7.3f} {s['p95']:>+7.3f} "
            f"{s['p99']:>+7.3f} {s['sum']:>+9.2f} {s['abs100']:>8.2f}")


def variant_arrays(rows, k, variant):
    sel = [r for r in rows if r["k"] == k]
    if variant == "own":
        ob = [r["ob"] for r in sel]
    else:
        ob = [r["obp"] for r in sel]
    oc = [r["oc"] for r in sel]
    ds = [a - b for a, b in zip(ob, oc)]
    return ds, ob, oc


# ---------------------------------------------------------------- main

def main():
    print("VINTAGE BOUND  first copies (minute bank) vs revised history (calibration cache)")
    print(f"window [{fmt_t(WS)}, {fmt_t(WE)})  run {datetime.now(UTC).strftime('%Y-%m-%dT%H:%M:%SZ')}  "
          f"python {sys.version.split()[0]}")
    print()

    with open(MANIFEST, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    by_provider = collections.OrderedDict()
    for s in manifest["symbols"]:
        by_provider.setdefault(s["providerSymbol"], []).append((s["symbol"], s["assetType"]))
    print(f"manifest: {len(manifest['symbols'])} markets on {len(by_provider)} provider series")
    shared = {p: v for p, v in by_provider.items() if len(v) > 1}
    for p, v in shared.items():
        print(f"  {p} serves {', '.join(m for m, _ in v)}: measured once, labelled {v[0][0]}")

    bank_files = sorted(f[:-6].replace("%5E", "^") for f in os.listdir(BANK) if f.endswith(".jsonl"))
    unmapped = [p for p in bank_files if p not in by_provider]
    no_bank = [p for p in by_provider if p not in bank_files]
    no_cache = [p for p in by_provider if not os.path.exists(cache_path(p))]
    print(f"bank files: {len(bank_files)}; not in manifest (skipped, no cache mapping): "
          f"{', '.join(unmapped) or 'none'}")
    print(f"manifest series with no bank file: {', '.join(no_bank) or 'none'}; "
          f"with no 5-min cache store: {', '.join(no_cache) or 'none'}")
    providers = [p for p in by_provider if p in bank_files and p not in no_cache]
    print()

    # ---- pass 1: bank only, derive the roster-wide outages
    # The witness is the manifest's crypto class: it trades 24/7, so a span in
    # which no crypto bank file holds a minute is the bank not running, not a
    # market closed. Session-limited symbols can hold minutes inside such a
    # span (a resuming run reaches back further for them), which is why the
    # whole roster is not the witness.
    bank_diag = {}
    bank_keys = {}
    witness = set()
    crypto = [p for p in providers if any(c == "crypto" for _, c in by_provider[p])]
    for p in providers:
        minutes, diag = load_bank(p)
        bank_diag[p] = diag
        bank_keys[p] = sorted(minutes)
        if p in crypto:
            witness.update(minutes.keys())
        del minutes  # values re-read in pass 2; holding 96 symbols' minutes is ~1 GB
    u = sorted(witness)
    outages = []
    prev = WS - MIN
    for t in u + [WE]:
        if t - prev > OUTAGE_MIN_GAP:
            outages.append((prev + MIN, t))
        prev = t
    print(f"BANK OUTAGES (derived: holes >= 60 min in which none of the {len(crypto)} crypto bank files,")
    print("24/7 markets, holds a minute)")
    import bisect
    for a, b in outages:
        holders = [p for p in providers
                   if bisect.bisect_left(bank_keys[p], a) < bisect.bisect_left(bank_keys[p], b)]
        print(f"  [{fmt_t(a)}, {fmt_t(b)})  {(b - a) / 3_600_000:.1f} h; "
              f"{len(holders)} non-crypto files nonetheless hold minutes inside it"
              f"{': ' + ' '.join(holders) if holders else ''}")
    print("  No bracket reads these spans (brackets need both vintages); they are not a skip reason.")
    first_min = {p: bank_keys[p][0] for p in providers if bank_keys[p]}
    late_start = [f"{p} {fmt_t(first_min[p])}" for p in providers
                  if p in first_min and first_min[p] >= WS + DAY]
    print(f"  bank files whose first window minute is a day or more after the window start: "
          f"{', '.join(late_start) or 'none'}")
    del bank_keys
    print()

    def in_outage(b):
        return any(a <= b < z or a < b + B5 <= z for a, z in outages)

    tot = collections.Counter()
    for d in bank_diag.values():
        for k in ("lines", "bad", "repeats", "late", "incoherent"):
            tot[k] += d[k]
    print(f"bank read: {tot['lines']:,} lines, {tot['bad']} unparseable, {tot['repeats']:,} repeated keys "
          f"(first kept), {tot['late']} window minutes appended >72 h late (not live captures), "
          f"{tot['incoherent']} incoherent-OHLC window minutes kept as-is")
    changed = [p for p, d in bank_diag.items() if d["changed"]]
    print(f"bank files that changed while being read: {', '.join(changed) or 'none'}")
    print()

    # ---- pass 2: per symbol, cache + step 1 + step 2
    runlog = read_run_log()
    if runlog is None:
        print(f"run log {BANK_LOG} absent: capture-lag tables not printed")
    else:
        first_ms, ok, _ = runlog
        print(f"run log {BANK_LOG}: first logged run {fmt_t(first_ms)}, {len(ok)} successful runs "
              f"(read-only; used only for the capture-lag tables)")
    print()
    results = {}
    digest_bank = hashlib.sha256()
    digest_cache = hashlib.sha256()
    for p in providers:
        market, aclass = by_provider[p][0]
        cache_bars, cdiag = load_cache(p)
        minutes, diag2 = load_bank(p)
        if diag2 != bank_diag[p]:
            raise SystemExit(f"{p}: bank read differs between passes {bank_diag[p]} vs {diag2}")
        for t in sorted(minutes):
            digest_bank.update(f"{p}|{t}|{minutes[t]!r}\n".encode())
        for t in sorted(cache_bars):
            if WS <= t < WE:
                digest_cache.update(f"{p}|{t}|{cache_bars[t]!r}\n".encode())
        bank_b, touched = build_buckets(minutes)
        del minutes
        reasons = []
        if cdiag["changed"]:
            reasons.append("cache store changed while being read")
        if cdiag["clock"] != "venue-wall-utc-v4":
            reasons.append(f"cache clock {cdiag['clock']}")
        if cdiag["first"] is None or cdiag["first"] > WS or cdiag["last"] < WE:
            reasons.append("cache does not span the window")
        # per-day coverage, outside the roster outages
        missing_bank_days, missing_cache_days = [], []
        cdays = collections.defaultdict(lambda: [0, 0])
        bdays = collections.defaultdict(lambda: [0, 0])
        for t in cache_bars:
            if WS <= t < WE and not in_outage(t):
                cdays[t // DAY][0] += 1
                cdays[t // DAY][1] += (t in touched)
        for t in bank_b:
            if not in_outage(t):
                bdays[t // DAY][0] += 1
                bdays[t // DAY][1] += (t in cache_bars)
        for dkey, (n, cov) in sorted(cdays.items()):
            if n >= MISSING_DAY_MIN_BARS and cov / n < MISSING_DAY_SHARE:
                missing_bank_days.append(f"{fmt_t(dkey * DAY)[:10]}({cov}/{n})")
        for dkey, (n, cov) in sorted(bdays.items()):
            if n >= MISSING_DAY_MIN_BARS and cov / n < MISSING_DAY_SHARE:
                missing_cache_days.append(f"{fmt_t(dkey * DAY)[:10]}({cov}/{n})")
        if missing_bank_days:
            reasons.append("bank missing days " + " ".join(missing_bank_days))
        if missing_cache_days:
            reasons.append("cache missing days " + " ".join(missing_cache_days))

        per_offset, best, best_day, per_day = construction(bank_b, cache_bars)
        lag_of = make_lag_of(p, runlog)
        by_lag = exact_by_lag(bank_b, cache_bars, lag_of)
        widths = range_width(bank_b, cache_bars)
        rows, skipped = ([], collections.Counter())
        if not reasons:
            ctimes = sorted(cache_bars)
            rows, skipped = brackets_for(bank_b, cache_bars, ctimes, lag_of)
        results[p] = dict(market=market, aclass=aclass, per_offset=per_offset, best=best,
                          best_day=best_day, reasons=reasons, rows=rows, skipped=skipped,
                          buckets=len(bank_b), cache_n=sum(1 for t in cache_bars if WS <= t < WE),
                          off_grid=cdiag["off_grid"], pinned=cdiag["pinned"], per_day=dict(per_day),
                          by_lag=by_lag, widths=widths)
        del cache_bars, bank_b
        print(f"  read {p:<10} bank buckets {results[p]['buckets']:>5}  cache bars {results[p]['cache_n']:>5}"
              f"{'  SKIP: ' + '; '.join(reasons) if reasons else ''}", flush=True)
    print()

    print(f"sha256 of the window data read (provider|utc ms|(o,h,l,c) lines, provider then time order):")
    print(f"  bank minutes  {digest_bank.hexdigest()}")
    print(f"  cache bars    {digest_cache.hexdigest()}")
    print()

    # ---- step 1 report
    print("STEP 1  CONSTRUCTION  complete bank buckets vs the cache bar of the same UTC open time")
    print(f"exact = all of open/high/low/close within {REL_TOL:g} relative; 'close' = close alone.")
    print("best offset = the label offset (min) with the highest all-four share; ties go to 0.")
    print("best day = highest all-four share on any one UTC day with >= 12 compared buckets (offset 0).")
    print(f"{'market':<9} {'provider':<10} {'class':<11} {'cmp':>5} {'exact':>5} {'exact%':>7} "
          f"{'close':>5} {'close%':>7} {'-5 ex%':>7} {'+5 ex%':>7} {'best':>5} {'bestDay':>7}  clean@30/50/70")
    clean_sets = {th: [] for th in SENSITIVITY}
    evaluated = []
    thin = []
    for p in providers:
        r = results[p]
        n, a, c = r["per_offset"][0]
        sh = a / n if n else 0.0
        r["share0"] = sh
        m5 = r["per_offset"][-B5]
        p5 = r["per_offset"][B5]
        flags = []
        if r["reasons"]:
            flags = ["SKIPPED, not counted"]
        else:
            evaluated.append(p)
            if n < MIN_COMPARED:
                thin.append(p)
            for th in SENSITIVITY:
                ok = r["best"] == 0 and n >= MIN_COMPARED and sh >= th
                flags.append("Y" if ok else ".")
                if ok:
                    clean_sets[th].append(p)
        print(f"{r['market']:<9} {p:<10} {r['aclass']:<11} {n:>5} {a:>5} {sh:>7.1%} {c:>5} "
              f"{(c / n if n else 0):>7.1%} {(m5[1] / m5[0] if m5[0] else 0):>7.1%} "
              f"{(p5[1] / p5[0] if p5[0] else 0):>7.1%} {r['best'] // MIN:>+5d} {r['best_day']:>7.1%}  "
              f"{'   '.join(flags)}")
    skipped_syms = [p for p in providers if results[p]["reasons"]]
    print()
    print(f"fewer than {MIN_COMPARED} compared buckets (never clean, JUDGED floor): {', '.join(thin) or 'none'}")
    print(f"evaluated {len(evaluated)} of {len(providers)} provider series; skipped {len(skipped_syms)}:")
    for p in skipped_syms:
        print(f"  {p}: {'; '.join(results[p]['reasons'])}")
    offsets_nonzero = [p for p in evaluated if results[p]["best"] != 0]
    print(f"best offset != 0: {', '.join(offsets_nonzero) or 'none'}")
    for th in SENSITIVITY:
        tag = "JUDGED" if th == CLEAN_SHARE else "sensitivity"
        print(f"construction-clean at >= {th:.0%} exact ({tag}): {len(clean_sets[th])}  "
              f"{' '.join(results[p]['market'] for p in clean_sets[th])}")
    ranked = sorted((p for p in evaluated if p not in thin), key=lambda p: -results[p]["share0"])
    if len(ranked) >= 25:
        print(f"the 25th-ranked exact share is {results[ranked[24]]['share0']:.1%} "
              f"({results[ranked[24]]['market']}), the 26th {results[ranked[25]]['share0']:.1%}: "
              f"a 25-symbol set needs a threshold in that interval")
    for lo, hi in ((0.9, 1.01), (0.5, 0.9), (0.3, 0.5), (0.1, 0.3), (0.0, 0.1)):
        k = sum(1 for p in evaluated if lo <= results[p]["share0"] < hi)
        print(f"  exact share in [{lo:.0%}, {min(hi, 1):.0%}{']' if hi > 1 else ')'}: {k}")
    k90 = sum(1 for p in evaluated if results[p]["best_day"] >= 0.9)
    print(f"symbols with some UTC day at >= 90% exact (construction reproduced on at least one day): "
          f"{k90} of {len(evaluated)}")
    print()
    step1_day = collections.defaultdict(lambda: [0, 0])
    for p in evaluated:
        for dkey, (n, a) in results[p]["per_day"].items():
            step1_day[dkey][0] += n
            step1_day[dkey][1] += a
    print("pooled exact share by UTC day (all evaluated symbols, offset 0):")
    print("  " + "  ".join(f"{fmt_t(d * DAY)[5:10]} {a / n:.0%}" for d, (n, a) in sorted(step1_day.items()) if n))
    wsum = collections.Counter()
    for p in evaluated:
        wsum.update(results[p]["widths"])
    n = wsum["n"]
    print(f"bank bucket extremes vs cache, all evaluated symbols, {n:,} compared buckets: high above cache "
          f"{wsum['hi_wider'] / n:.1%}, below {wsum['hi_narrower'] / n:.1%}; low below cache "
          f"{wsum['lo_wider'] / n:.1%}, above {wsum['lo_narrower'] / n:.1%}")
    if runlog is not None:
        pool = collections.defaultdict(lambda: [0, 0])
        for p in evaluated:
            for c, (n, a) in results[p]["by_lag"].items():
                pool[c][0] += n
                pool[c][1] += a
        print("pooled exact share by estimated capture lag of the bank's first copy (run log; the lag")
        print("is from the bucket's end to the first logged run that banked the symbol afterwards):")
        for c in ["pre-log"] + [name for _, _, name in LAG_CLASSES]:
            n, a = pool.get(c, (0, 0))
            print(f"  {c:>8}: {n:>7} buckets, exact {a / n if n else 0:.1%}")
    print()

    # ---- step 2 report
    clean = clean_sets[CLEAN_SHARE]
    print("STEP 2  SYNTHETIC BRACKETS  (construction-clean at the JUDGED 50% threshold)")
    print("decision = the bucket OPENING at 00/04/08/12/16/20Z; entry at its close on each vintage;")
    print("ATR = mean(high-low) of the last 14 CACHE bars up to and including it; forward = the next 96")
    print("5-min slots inside the window, each vintage resolving over the slots it holds (>= 90 each).")
    print("Outcome R: +1 target, -1 stop (both in one bucket = stop), else signed (last held close - ref)")
    print("over the stop distance k*ATR.  d = outcome_bank - outcome_cache.")
    print("variant 'own': each vintage's own reference.  variant 'cacheRef': the bank path read from the")
    print("cache's reference and ATR, so only the path differs.")
    print()
    for p in clean:
        r = results[p]
        sk = ", ".join(f"{k} {v}" for k, v in sorted(r["skipped"].items()))
        nd = len({x["t"] for x in r["rows"]})
        print(f"{r['market']} ({p}, {r['aclass']}): {nd} decisions; not taken: {sk or 'none'}")
        if not r["rows"]:
            continue
        print(f"   {'k':>4} {'variant':<8} " + STAT_HEAD)
        for k in BRACKETS_K:
            for variant in ("own", "cacheRef"):
                ds, ob, oc = variant_arrays(r["rows"], k, variant)
                s = summarize(ds, ob, oc)
                print(f"   {k:>4} {variant:<8} " + stat_line(s))
    print()

    def pooled_block(title, syms):
        rows = [x for p in syms for x in results[p]["rows"]]
        with_rows = [p for p in syms if results[p]["rows"]]
        print(f"POOLED {title}: {len(syms)} symbols, {len(with_rows)} with brackets, "
              f"{len({(p, x['t']) for p in syms for x in results[p]['rows']})} decisions")
        if not rows:
            print("   no brackets")
            return {}
        print(f"   {'k':>4} {'variant':<8} " + STAT_HEAD)
        out = {}
        for k in BRACKETS_K:
            for variant in ("own", "cacheRef"):
                ds, ob, oc = variant_arrays(rows, k, variant)
                s = summarize(ds, ob, oc)
                means = []
                for p in with_rows:
                    dsp, _, _ = variant_arrays(results[p]["rows"], k, variant)
                    means.append((sum(dsp) / len(dsp), f"{results[p]['market']} n={len(dsp)}"))
                out[(k, variant)] = (s, min(means), max(means))
                print(f"   {k:>4} {variant:<8} " + stat_line(s))
        return out

    head = pooled_block("construction-clean @50% (JUDGED, the headline)", clean)
    print()
    if head:
        print("BAND (headline set): pooled p1..p99 of d, and the per-symbol range of mean d")
        for k in BRACKETS_K:
            for variant in ("own", "cacheRef"):
                s, lo, hi = head[(k, variant)]
                print(f"   k={k:<4} {variant:<8} p1..p99 [{s['p1']:+.3f}, {s['p99']:+.3f}] R   "
                      f"mean d per symbol [{lo[0]:+.4f} {lo[1]}, {hi[0]:+.4f} {hi[1]}] R   "
                      f"pooled mean {s['mean']:+.4f} R over {s['n']} brackets")
        print()
        rows = [x for p in clean for x in results[p]["rows"]]
        print("outcome transitions, headline set, variant 'own' (rows = cache, columns = bank):")
        for k in BRACKETS_K:
            sel = [x for x in rows if x["k"] == k]
            m = collections.Counter((x["kc"], x["kb"]) for x in sel)
            print(f"   k={k}: " + "  ".join(f"{a}->{b} {m[(a, b)]}" for a in "TSE" for b in "TSE"))
        for k in BRACKETS_K:
            sel = [x for x in rows if x["k"] == k]
            jc = [x["jc"] for x in sel if x["jc"]]
            jb = [x["jb"] for x in sel if x["jb"]]
            print(f"   k={k}: resolving bucket, median slot cache {statistics.median(jc):.0f} / bank "
                  f"{statistics.median(jb):.0f} (x5 min); stops from a bucket touching both levels: "
                  f"cache {sum(x['bc'] for x in sel)}, bank {sum(x['bb'] for x in sel)}")
        hd = sum(1 for x in rows if x["held_differ"]) / len(rows)
        print(f"   brackets whose two vintages hold different forward slots: {hd:.1%}")
        spans = [x["atr_span_h"] for x in rows]
        print(f"   ATR window span (first to last of the 14 cache bars): median "
              f"{statistics.median(spans):.2f} h, max {max(spans):.1f} h")
        print()

    def split_by_lag(title, syms):
        rows = [x for p in syms for x in results[p]["rows"]]
        if not rows or runlog is None:
            return
        print(f"d != 0 share by estimated capture lag of the decision bucket, {title}, variant 'own':")
        for k in BRACKETS_K:
            parts = []
            for c in ["pre-log"] + [name for _, _, name in LAG_CLASSES]:
                sel = [x for x in rows if x["k"] == k and lag_class(x["lag"]) == c]
                if sel:
                    nz = sum(1 for x in sel if x["ob"] != x["oc"])
                    parts.append(f"{c} {nz}/{len(sel)} ({nz / len(sel):.1%})")
            print(f"   k={k}: " + ";  ".join(parts))

    split_by_lag("headline set", clean)
    print()
    print("SENSITIVITY (same statistics, other symbol sets)")
    for th in SENSITIVITY:
        if th == CLEAN_SHARE:
            continue
        pooled_block(f"construction-clean @{th:.0%}", clean_sets[th])
        print()
    proven = [p for p in evaluated if p not in thin and results[p]["best"] == 0
              and results[p]["best_day"] >= 0.90]
    pooled_block("construction proven: some UTC day >= 90% exact (not in the brief)", proven)
    print()
    # all evaluated symbols: brackets only exist for the non-skipped ones
    pooled_block("every evaluated symbol (no construction filter)", evaluated)
    rows = [x for p in evaluated for x in results[p]["rows"]]
    if rows:
        for k in BRACKETS_K:
            sel = [x for x in rows if x["k"] == k]
            m = collections.Counter((x["kc"], x["kb"]) for x in sel)
            print(f"   transitions k={k} (cache->bank): " + "  ".join(
                f"{a}->{b} {m[(a, b)]}" for a in "TSE" for b in "TSE" if m[(a, b)]) +
                f";  both-touch stops cache {sum(x['bc'] for x in sel)}, bank {sum(x['bb'] for x in sel)}")
    split_by_lag("every evaluated symbol", evaluated)
    print()
    print("BY CLASS (manifest assetType), every evaluated symbol, variant 'own':")
    classes = sorted({results[p]["aclass"] for p in evaluated})
    for c in classes:
        w = collections.Counter()
        for p in evaluated:
            if results[p]["aclass"] == c:
                w.update(results[p]["widths"])
        n = w["n"]
        print(f"   {c:<11} step-1 extremes over {n:,} buckets: bank high above cache {w['hi_wider'] / n:.1%}, "
              f"below {w['hi_narrower'] / n:.1%}; bank low below cache {w['lo_wider'] / n:.1%}, "
              f"above {w['lo_narrower'] / n:.1%}")
    print(f"   {'class':<11} {'k':>4} {'syms':>4} " + STAT_HEAD)
    for c in classes:
        syms = [p for p in evaluated if results[p]["aclass"] == c and results[p]["rows"]]
        rows = [x for p in syms for x in results[p]["rows"]]
        if not rows:
            print(f"   {c:<11} no brackets (no 8-hour forward span in the session)")
            continue
        for k in BRACKETS_K:
            ds, ob, oc = variant_arrays(rows, k, "own")
            print(f"   {c:<11} {k:>4} {len(syms):>4} " + stat_line(summarize(ds, ob, oc)))
    print()
    zero = [results[p]["market"] for p in clean if not results[p]["rows"]]
    print(f"headline-set symbols with no bracket (no 8-hour forward span in their session): "
          f"{', '.join(zero) or 'none'}")


if __name__ == "__main__":
    main()
