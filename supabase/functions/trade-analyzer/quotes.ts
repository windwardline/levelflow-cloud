export type QuoteSnapshot = {
  ask: number;
  bid: number;
  price: number | null;
  spread: number;
  source: "fmp_quote";
};

export function parseFmpQuoteSnapshot(payload: unknown): QuoteSnapshot | null {
  const record = pickQuoteRecord(payload);
  if (!record) {
    return null;
  }

  const bid = readNumericField(record, ["bid", "bidPrice", "bid_price"]);
  const ask = readNumericField(record, ["ask", "askPrice", "ask_price"]);
  if (!bid || !ask || ask <= bid) {
    return null;
  }

  const price = readNumericField(record, [
    "price",
    "lastPrice",
    "last",
    "close",
  ]);

  return {
    ask,
    bid,
    price,
    source: "fmp_quote",
    spread: roundQuoteValue(ask - bid),
  };
}

function pickQuoteRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const first = payload.find(isRecord);
    return first ?? null;
  }

  return isRecord(payload) ? payload : null;
}

function readNumericField(
  record: Record<string, unknown>,
  names: string[],
): number | null {
  for (const name of names) {
    const value = record[name];
    const numericValue = typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function roundQuoteValue(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
}
