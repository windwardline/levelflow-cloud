import cors from "cors";
import express from "express";
import { startE8MaintenanceJobs } from "./cron/e8Maintenance";
import { TradeAnalyzer, type AccountRiskProfile, type OhlcvBar } from "./services/tradeAnalyzer";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const analyzer = new TradeAnalyzer();

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "levelflow-cloud",
    timezone: process.env.E8_SERVER_TIMEZONE ?? "Europe/Prague",
  });
});

app.post("/api/analyze", (request, response) => {
  const body = request.body as {
    symbol?: string;
    bars?: OhlcvBar[];
    account?: AccountRiskProfile;
  };

  if (!body.symbol || !body.bars || !body.account) {
    response.status(400).json({ error: "symbol, bars, and account are required." });
    return;
  }

  const setup = analyzer.analyze(body.symbol, body.bars, body.account, {
    highImpactWithinWindow: false,
    signatureBypass: body.account.programCode === "e8_signature",
    events: [],
  });

  response.json({ setup });
});

startE8MaintenanceJobs();

app.listen(port, () => {
  console.log(`LevelFlow Cloud API listening on :${port}`);
});
