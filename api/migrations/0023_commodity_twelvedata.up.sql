-- Komoditas Twelve Data untuk ticker LIVE MARKET (Brent, WTI, Nikel, Perak).
-- provider_symbol mengikuti katalog /commodities (XBR/USD, WTI/USD, NI1, XAG/USD).
INSERT INTO instruments (symbol, name, exchange, asset_class, currency, provider_symbol, sector, active, in_ticker)
VALUES
  ('XBRUSD', 'Minyak Brent / Dolar AS', 'Spot', 'commodity', 'USD', 'XBR/USD', NULL, true, true),
  ('WTIUSD', 'Minyak WTI / Dolar AS',   'Spot', 'commodity', 'USD', 'WTI/USD', NULL, true, true),
  ('NI1',    'Nikel Futures',           'Spot', 'commodity', 'USD', 'NI1',     NULL, true, true),
  ('XAGUSD', 'Perak / Dolar AS',        'Spot', 'commodity', 'USD', 'XAG/USD', NULL, true, true)
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  exchange = EXCLUDED.exchange,
  asset_class = EXCLUDED.asset_class,
  currency = EXCLUDED.currency,
  provider_symbol = EXCLUDED.provider_symbol,
  active = true,
  in_ticker = COALESCE(instruments.in_ticker, true),
  updated_at = now();
