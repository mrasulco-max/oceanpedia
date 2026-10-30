package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const qMarketCacheGet = `SELECT coalesce(body::text, ''), error, fetched_at FROM market_cache WHERE key = $1`
const qMarketCachePut = `INSERT INTO market_cache (key, body, error, fetched_at) VALUES ($1, nullif($2, '')::jsonb, $3, now())
ON CONFLICT (key) DO UPDATE SET body = coalesce(EXCLUDED.body, market_cache.body), error = EXCLUDED.error, fetched_at = EXCLUDED.fetched_at`

// MarketCacheGet / MarketCachePut mengimplementasikan market.KV.
func (p *PG) MarketCacheGet(ctx context.Context, key string) ([]byte, string, time.Time, bool, error) {
	var (
		body, errText string
		at            time.Time
	)
	err := p.DB.QueryRowContext(ctx, qMarketCacheGet, key).Scan(&body, &errText, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", time.Time{}, false, nil
	}
	if err != nil {
		return nil, "", time.Time{}, false, err
	}
	return []byte(body), errText, at, true, nil
}

func (p *PG) MarketCachePut(ctx context.Context, key string, body []byte, errText string) error {
	_, err := p.DB.ExecContext(ctx, qMarketCachePut, key, string(body), errText)
	return err
}
