> **Identity annotation (round 8 CV-1/FR-2, added 2026-08-11):** this document
> reads the 2026-08-10 baseline corpus, whose universe carried provider
> spellings (six ^-prefixed indices, ARUSD, OTRUMPUSD, WTI's provider name);
> getAssetType's silent forex fallback ran all nine under forex calibration,
> sessions, costs and completion conventions — ARUSD/OTRUMPUSD additionally
> took a 2-3h daily-completion look-ahead. "Forex" rows are inflated with
> non-FX symbols and indices/energies rows are absent or misplaced. The
> roster-name refleet (sweeps/4c, per-class fold spec) supersedes these
> numbers. Kept unrewritten by design: annotated evidence, not history-edit.

corpus 3b108f43d4c2 · engine 2026.08.09.evaluator-repair · 764936 baseline rows (holdout excluded)

## Q1 — ladder decomposition (accepted stream)

| class | filled | banked R | runner-half R | cost R | net R | single-target R | be-exits | be MFE p50 (R) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| agriculture | 6623 | 1111.4 | -994.9 | 2537.2 | -2420.7 | -2372.6 | 2596 | 0.750 |
| crypto | 184401 | 35154.6 | -35906.1 | 32782.3 | -33533.9 | -33638.1 | 75142 | 0.944 |
| forex | 323631 | 62646.4 | -51696.3 | 29855.4 | -18905.2 | -24897.2 | 142680 | 0.917 |
| futures | 24745 | 4374.9 | -5765.5 | 5484.6 | -6875.2 | -6793.9 | 8704 | 0.885 |
| livestock | 1133 | 204.9 | -238.0 | 147.6 | -180.7 | -146.5 | 371 | 0.933 |
| metals | 13025 | 1983.1 | -1915.0 | 2989.7 | -2921.6 | -2894.7 | 6065 | 0.729 |

## Q2 — stop model (accepted stream)

| class | provenance | n | mean R | R < −1.1 | winner MAE/R p50 | p90 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| agriculture | cap | 6623 | -0.365 | 2121 | 0.214 | 0.667 |
| crypto | cap | 184401 | -0.182 | 54889 | 0.278 | 0.772 |
| forex | cap | 323631 | -0.058 | 41316 | 0.253 | 0.740 |
| futures | cap | 24745 | -0.278 | 7589 | 0.280 | 0.778 |
| livestock | cap | 1133 | -0.160 | 324 | 0.224 | 0.658 |
| metals | cap | 11533 | -0.235 | 3119 | 0.237 | 0.754 |
| metals | pivot | 1233 | -0.135 | 269 | 0.233 | 0.713 |
| metals | volatility_floor | 259 | -0.162 | 65 | 0.188 | 0.597 |

## Q3 — confidence rank power (full capture range)

| class | decile | n | mean R | | class ρ (score→R) |
| --- | ---: | ---: | ---: | --- | ---: |
| agriculture | 1 | 757 | -0.403 | | 0.014 |
| agriculture | 2 | 946 | -0.443 | |  |
| agriculture | 3 | 851 | -0.391 | |  |
| agriculture | 4 | 801 | -0.461 | |  |
| agriculture | 5 | 856 | -0.398 | |  |
| agriculture | 6 | 966 | -0.433 | |  |
| agriculture | 7 | 930 | -0.371 | |  |
| agriculture | 8 | 843 | -0.309 | |  |
| agriculture | 9 | 892 | -0.453 | |  |
| agriculture | 10 | 890 | -0.358 | |  |
| crypto | 1 | 20765 | -0.257 | | 0.058 |
| crypto | 2 | 22158 | -0.168 | |  |
| crypto | 3 | 22701 | -0.189 | |  |
| crypto | 4 | 19028 | -0.206 | |  |
| crypto | 5 | 22771 | -0.211 | |  |
| crypto | 6 | 22450 | -0.169 | |  |
| crypto | 7 | 21433 | -0.163 | |  |
| crypto | 8 | 22524 | -0.171 | |  |
| crypto | 9 | 12614 | -0.147 | |  |
| crypto | 10 | 33441 | -0.148 | |  |
| forex | 1 | 34827 | -0.085 | | 0.035 |
| forex | 2 | 40711 | -0.064 | |  |
| forex | 3 | 33806 | -0.058 | |  |
| forex | 4 | 42622 | -0.059 | |  |
| forex | 5 | 35668 | -0.067 | |  |
| forex | 6 | 36835 | -0.046 | |  |
| forex | 7 | 39581 | -0.050 | |  |
| forex | 8 | 39862 | -0.045 | |  |
| forex | 9 | 33939 | -0.071 | |  |
| forex | 10 | 42308 | -0.023 | |  |
| futures | 1 | 2722 | -0.335 | | 0.031 |
| futures | 2 | 3763 | -0.326 | |  |
| futures | 3 | 2884 | -0.316 | |  |
| futures | 4 | 3772 | -0.323 | |  |
| futures | 5 | 3066 | -0.321 | |  |
| futures | 6 | 3756 | -0.309 | |  |
| futures | 7 | 3268 | -0.323 | |  |
| futures | 8 | 3447 | -0.311 | |  |
| futures | 9 | 2231 | -0.275 | |  |
| futures | 10 | 4441 | -0.262 | |  |
| livestock | 1 | 148 | -0.237 | | 0.044 |
| livestock | 2 | 119 | -0.071 | |  |
| livestock | 3 | 178 | -0.276 | |  |
| livestock | 4 | 139 | -0.300 | |  |
| livestock | 5 | 152 | 0.059 | |  |
| livestock | 6 | 155 | -0.051 | |  |
| livestock | 7 | 144 | -0.297 | |  |
| livestock | 8 | 136 | -0.016 | |  |
| livestock | 9 | 138 | -0.051 | |  |
| livestock | 10 | 178 | -0.185 | |  |
| metals | 1 | 1520 | -0.266 | | 0.036 |
| metals | 2 | 1540 | -0.252 | |  |
| metals | 3 | 1499 | -0.248 | |  |
| metals | 4 | 1588 | -0.287 | |  |
| metals | 5 | 1234 | -0.255 | |  |
| metals | 6 | 1809 | -0.219 | |  |
| metals | 7 | 1583 | -0.223 | |  |
| metals | 8 | 1595 | -0.256 | |  |
| metals | 9 | 1080 | -0.175 | |  |
| metals | 10 | 2099 | -0.204 | |  |

## Q4 — the window (accepted stream)

| class | resolved | expiry share | in-profit expiries | hrs-to-exit p50 | p90 | window hrs (mode) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| agriculture | 6623 | 0.052 | 141 | 0.5 | 3.0 | 6 |
| crypto | 184401 | 0.003 | 249 | 0.5 | 2.0 | 12 |
| forex | 323631 | 0.012 | 1865 | 0.5 | 2.0 | 8 |
| futures | 24745 | 0.013 | 111 | 0.5 | 1.8 | 6 |
| livestock | 1133 | 0.017 | 6 | 0.5 | 20.0 | 24 |
| metals | 13025 | 0.037 | 154 | 1.0 | 4.3 | 8 |

## Q5 — regime × class (accepted stream, clustered SE)

| class | regime | n | mean R | ± clustered SE |
| --- | --- | ---: | ---: | ---: |
| agriculture | compression | 1369 | -0.368 | 0.026 |
| agriculture | range | 2927 | -0.366 | 0.016 |
| agriculture | trend | 2327 | -0.363 | 0.016 |
| crypto | compression | 35173 | -0.213 | 0.014 |
| crypto | range | 71386 | -0.173 | 0.013 |
| crypto | trend | 77842 | -0.176 | 0.016 |
| forex | compression | 81610 | -0.060 | 0.010 |
| forex | range | 125527 | -0.055 | 0.008 |
| forex | trend | 116494 | -0.061 | 0.009 |
| futures | compression | 5201 | -0.313 | 0.044 |
| futures | range | 10280 | -0.259 | 0.032 |
| futures | trend | 9264 | -0.279 | 0.034 |
| livestock | compression | 139 | 0.018 | 0.216 |
| livestock | range | 471 | -0.159 | 0.044 |
| livestock | trend | 523 | -0.207 | 0.024 |
| metals | compression | 2929 | -0.237 | 0.029 |
| metals | range | 4457 | -0.231 | 0.014 |
| metals | trend | 5639 | -0.212 | 0.020 |
