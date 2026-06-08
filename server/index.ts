import cors from "cors";
import express from "express";
import { TradeAnalyzer, type OhlcvBar } from "./services/tradeAnalyzer";

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
    timezone: process.env.SERVER_TIMEZONE ?? "UTC",
  });
});

app.post("/api/analyze", (request, response) => {
  const body = request.body as {
    symbol?: string;
    bars?: OhlcvBar[];
  };

  if (!body.symbol || !body.bars) {
    response.status(400).json({ error: "symbol and bars are required." });
    return;
  }

  const setup = analyzer.analyze(body.symbol, body.bars, {
    highImpactWithinWindow: false,
    events: [],
  });

  response.json({ setup });
});

app.listen(port, () => {
  console.log(`LevelFlow Cloud API listening on :${port}`);
});
