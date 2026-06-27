import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetDir = path.resolve("dist", "assets");
const budgets = {
  ".css": 80 * 1024,
  ".js": 230 * 1024,
};

const files = await readdir(assetDir);
const budgetFailures = [];

for (const file of files) {
  const extension = path.extname(file);
  const budget = budgets[extension];
  if (!budget) {
    continue;
  }

  const { size } = await stat(path.join(assetDir, file));
  if (size > budget) {
    budgetFailures.push(`${file} is ${formatBytes(size)}; budget is ${formatBytes(budget)}.`);
  }
}

if (budgetFailures.length > 0) {
  console.error(budgetFailures.join("\n"));
  process.exit(1);
}

console.log("Bundle budget verified.");

function formatBytes(value) {
  return `${Math.round(value / 1024)} KB`;
}
