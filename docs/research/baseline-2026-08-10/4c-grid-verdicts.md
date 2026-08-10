npm notice run levelflow-cloud@0.1.0 npx
npm notice run 'tsx' scripts/grid-totalr.ts sweeps/4c/shard-0.jsonl sweeps/4c/shard-1.jsonl sweeps/4c/shard-2.jsonl sweeps/4c/shard-3.jsonl sweeps/4c/shard-4.jsonl sweeps/4c/shard-5.jsonl sweeps/4c/shard-6.jsonl sweeps/4c/shard-7.jsonl --baseline confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1 --permutations 1000 --seed 7
Error: sweeps/4c/shard-1.jsonl: shard conditions differ from sweeps/4c/shard-0.jsonl — engine, grid, folds, step or warmup do not match; these are not shards of one measurement
    at gradeCorpus (/Users/peacock/Projects/levelflow-cloud/scripts/grid-totalr.ts:376:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async main (/Users/peacock/Projects/levelflow-cloud/scripts/grid-totalr.ts:418:45)
