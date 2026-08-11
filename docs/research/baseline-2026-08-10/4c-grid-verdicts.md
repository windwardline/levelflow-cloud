npm notice run levelflow-cloud@0.1.0 npx
npm notice run 'tsx' scripts/grid-totalr.ts sweeps/4c/shard-0.jsonl sweeps/4c/shard-1.jsonl sweeps/4c/shard-2.jsonl sweeps/4c/shard-3.jsonl sweeps/4c/shard-4.jsonl sweeps/4c/shard-5.jsonl sweeps/4c/shard-6.jsonl sweeps/4c/shard-7.jsonl --baseline confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1 --permutations 1000 --seed 7
folds: fit=fit select=select confirm=confirm (read once, accepted variants only) · holdout 2 markets excluded
corpus 2449ed8ef9f1 · engine 2026.08.09.evaluator-repair · anchor 2026-08-10

=== CRYPTO ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                           0.0      1.2   0.00   -0.000   0.513  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3     241.4    786.8   2.55    0.016   0.003  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 4.1
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1    -331.9   1937.7   6.91    0.030   0.001  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3      12.2   2579.0   9.12    0.044   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 10918.9
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1    -349.1   3026.7  11.11    0.047   0.001  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       6.1   3646.8  13.19    0.061   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 17156.5
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1    -339.0   3205.9  11.94    0.049   0.001  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3      17.6   3821.9  13.97    0.064   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 19794.4
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1     519.6    788.5   2.40    0.013   0.016  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 515.5
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3     871.0   2056.1   6.20    0.037   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 510.7
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1      74.3   2437.0   8.05    0.038   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 10948.4
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3     563.4   3496.7  11.40    0.059   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 10891.3
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1      39.2   3582.9  12.32    0.058   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 17184.5
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3     533.7   4611.8  15.55    0.077   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 17165.4
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1      31.3   3816.9  13.41    0.061   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 20024.8
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3     529.0   4807.3  16.49    0.081   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 19810.2
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1     231.8    349.8   1.17    0.006   0.146  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR -97.6
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3     516.3   1404.5   4.66    0.026   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR -100.8
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1    -146.4   2153.0   7.87    0.033   0.001  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3     281.9   2984.3  10.83    0.050   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 10695.7
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1    -212.2   3243.4  12.22    0.051   0.001  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3     221.3   4060.5  15.09    0.068   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 16945.9
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1    -204.8   3393.7  12.95    0.053   0.001  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3     220.0   4183.4  15.69    0.070   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 19648.2

=== FOREX ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                          -0.9      2.8   0.01    0.000   0.509  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3      13.0     73.4   0.22    0.001   0.378  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1    6069.6   1591.0   5.24    0.020   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1545.6
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3    6080.2   1875.9   6.15    0.025   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1866.4
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1    8601.6   2488.1   8.41    0.032   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 2586.9
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3    8566.5   2735.9   9.17    0.036   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 2935.4
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1    9462.9   2854.3   9.78    0.037   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3107.6
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3    9468.3   3088.2  10.43    0.041   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3417.9
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1    1527.3   1174.6   3.31    0.016   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 840.9
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3    1532.7   1278.0   3.60    0.017   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 925.2
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1    7782.2   2519.1   7.72    0.033   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 2411.2
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3    7770.5   2904.2   8.85    0.039   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 2787.2
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1   10213.7   3336.1  10.58    0.044   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3341.1
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3   10141.9   3732.7  11.72    0.050   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3814.5
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1   10926.3   3579.5  11.56    0.048   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3858.5
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3   10917.2   3943.4  12.55    0.052   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 4277.9
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1    1104.8    753.1   2.31    0.010   0.017  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1487.7
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3    1114.9    857.2   2.62    0.012   0.011  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1611.0
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1    7294.2   2459.4   8.25    0.032   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 2871.4
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3    7296.5   2891.9   9.67    0.038   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3375.8
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1    9625.6   3229.0  11.13    0.043   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 3657.2
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3    9619.5   3699.7  12.64    0.049   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 4273.5
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1   10189.4   3549.0  12.38    0.047   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 4108.6
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3   10297.9   3992.1  13.74    0.053   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 4696.8

=== FUTURES ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                           0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails

=== LIVESTOCK ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                           0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails

=== AGRICULTURE ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                           0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1       0.0      0.0   0.00    0.000   1.000  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3       0.0      0.0   0.00    0.000   1.000  fails

=== METALS ===
variant                         ΔR fit   ΔR sel      σ   ΔE sel       p  verdict
baseline                         295.4    184.3   3.00    0.121   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 514.3
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=3      -2.3      0.2   0.00    0.001   0.516  fails
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=1     285.4    181.1   2.95    0.121   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 499.3
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1.6,sizingHoursFactor=3     279.6    171.8   2.78    0.125   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 501.8
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=1     540.6    341.6   5.66    0.175   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 882.0
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=2.5,sizingHoursFactor=3     517.9    319.3   5.23    0.182   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 891.1
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=1     661.9    429.8   7.31    0.190   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1088.6
confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=4,sizingHoursFactor=3     631.9    388.8   6.46    0.200   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1053.7
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=1     -27.0      1.3   0.02    0.001   0.502  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1,sizingHoursFactor=3     -28.9     -2.0  -0.03   -0.000   0.522  fails
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=1     260.9    182.0   2.76    0.122   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 522.0
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=1.6,sizingHoursFactor=3     254.9    176.3   2.66    0.126   0.002  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 524.4
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=1     496.4    358.0   5.56    0.180   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 922.9
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=2.5,sizingHoursFactor=3     474.2    345.8   5.30    0.190   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 938.0
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=1     613.3    432.7   6.96    0.191   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1115.5
confidenceThreshold=0,runnerProtection=hold,maxStopAtrMultiplier=4,sizingHoursFactor=3     584.5    396.6   6.22    0.202   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1089.2
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=1      44.7     25.9   0.41    0.010   0.325  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1,sizingHoursFactor=3      43.7     27.3   0.43    0.011   0.313  fails
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=1     319.2    209.2   3.47    0.130   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 475.2
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=1.6,sizingHoursFactor=3     316.2    203.2   3.36    0.134   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 471.1
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=1     551.5    372.0   6.30    0.185   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 861.3
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=2.5,sizingHoursFactor=3     533.1    354.7   5.95    0.192   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 852.2
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1     675.1    457.3   7.94    0.199   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1065.4
confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3     651.3    417.9   7.10    0.209   0.001  ACCEPT — fit+select, ≥1σ, expectancy holds · confirm ΔR 1021.7
