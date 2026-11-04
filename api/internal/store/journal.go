package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= Jurnal Trading

// JournalEntry satu catatan posisi di jurnal trading pengguna.
type JournalEntry struct {
	ID         string   `json:"id"`
	Symbol     string   `json:"symbol"`
	Market     string   `json:"market"`
	Side       string   `json:"side"` // long | short
	Currency   string   `json:"currency"`
	EntryPrice float64  `json:"entry_price"`
	ExitPrice  *float64 `json:"exit_price"`
	Quantity   float64  `json:"quantity"`
	// ContractSize: satuan per lot (forex 100.000, emas 100 oz, saham/crypto 1).
	ContractSize float64    `json:"contract_size"`
	Fees         float64    `json:"fees"`
	StopLoss     *float64   `json:"stop_loss"`
	TakeProfit   *float64   `json:"take_profit"`
	OpenedAt     time.Time  `json:"opened_at"`
	ClosedAt     *time.Time `json:"closed_at"`
	Strategy     string     `json:"strategy"`
	Emotion      string     `json:"emotion"`
	Notes        string     `json:"notes"`
	Tags         []string   `json:"tags"`
	Rating       *int       `json:"rating"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

const journalCols = `id, symbol, market, side, currency, entry_price::float8, exit_price::float8, quantity::float8, contract_size::float8, fees::float8,
  stop_loss::float8, take_profit::float8, opened_at, closed_at, strategy, emotion, notes, array_to_json(tags)::text, rating, created_at, updated_at`

const qJournalList = `SELECT ` + journalCols + ` FROM trading_journal WHERE user_id = $1::uuid ORDER BY opened_at DESC, created_at DESC LIMIT $2::int`
const qJournalCount = `SELECT count(*) FROM trading_journal WHERE user_id = $1::uuid`
const qJournalInsert = `INSERT INTO trading_journal (user_id, symbol, market, side, currency, entry_price, exit_price, quantity, fees, stop_loss, take_profit,
  opened_at, closed_at, strategy, emotion, notes, tags, rating, contract_size)
VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::float8, $7::float8, $8::float8, $9::float8, $10::float8, $11::float8,
  $12::timestamptz, $13::timestamptz, $14::text, $15::text, $16::text, $17::text[], $18::smallint, $19::float8)
RETURNING ` + journalCols
const qJournalUpdate = `UPDATE trading_journal SET symbol = $3::text, market = $4::text, side = $5::text, currency = $6::text, entry_price = $7::float8,
  exit_price = $8::float8, quantity = $9::float8, fees = $10::float8, stop_loss = $11::float8, take_profit = $12::float8, opened_at = $13::timestamptz,
  closed_at = $14::timestamptz, strategy = $15::text, emotion = $16::text, notes = $17::text, tags = $18::text[], rating = $19::smallint, contract_size = $20::float8, updated_at = now()
WHERE id = $1::uuid AND user_id = $2::uuid
RETURNING ` + journalCols
const qJournalDelete = `DELETE FROM trading_journal WHERE id = $1::uuid AND user_id = $2::uuid`

type rowScanner interface{ Scan(dest ...any) error }

func scanJournal(r rowScanner) (JournalEntry, error) {
	var e JournalEntry
	var exit, sl, tp sql.NullFloat64
	var closed sql.NullTime
	var rating sql.NullInt32
	var tags string
	err := r.Scan(&e.ID, &e.Symbol, &e.Market, &e.Side, &e.Currency, &e.EntryPrice, &exit, &e.Quantity, &e.ContractSize, &e.Fees, &sl, &tp,
		&e.OpenedAt, &closed, &e.Strategy, &e.Emotion, &e.Notes, &tags, &rating, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return e, err
	}
	if exit.Valid {
		e.ExitPrice = &exit.Float64
	}
	if sl.Valid {
		e.StopLoss = &sl.Float64
	}
	if tp.Valid {
		e.TakeProfit = &tp.Float64
	}
	if closed.Valid {
		e.ClosedAt = &closed.Time
	}
	if rating.Valid {
		v := int(rating.Int32)
		e.Rating = &v
	}
	_ = json.Unmarshal([]byte(tags), &e.Tags)
	if e.Tags == nil {
		e.Tags = []string{}
	}
	return e, nil
}

func nf(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func nt(p *time.Time) any {
	if p == nil {
		return nil
	}
	return *p
}

func ni(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

// Journal: catatan jurnal milik pengguna (terbaru dulu).
func (p *PG) Journal(ctx context.Context, uid string, limit int) ([]JournalEntry, error) {
	rows, err := p.DB.QueryContext(ctx, qJournalList, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []JournalEntry{}
	for rows.Next() {
		e, err := scanJournal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// JournalCount: jumlah catatan pengguna (untuk batas).
func (p *PG) JournalCount(ctx context.Context, uid string) (int, error) {
	var n int
	err := p.DB.QueryRowContext(ctx, qJournalCount, uid).Scan(&n)
	return n, err
}

// SaveJournal menambah (e.ID kosong) atau memperbarui catatan milik pengguna.
func (p *PG) SaveJournal(ctx context.Context, uid string, e JournalEntry) (JournalEntry, error) {
	tags := pgTextArray(e.Tags)
	if e.ID == "" {
		return scanJournal(p.DB.QueryRowContext(ctx, qJournalInsert, uid, e.Symbol, e.Market, e.Side, e.Currency, e.EntryPrice, nf(e.ExitPrice), e.Quantity,
			e.Fees, nf(e.StopLoss), nf(e.TakeProfit), e.OpenedAt, nt(e.ClosedAt), e.Strategy, e.Emotion, e.Notes, tags, ni(e.Rating), e.ContractSize))
	}
	out, err := scanJournal(p.DB.QueryRowContext(ctx, qJournalUpdate, e.ID, uid, e.Symbol, e.Market, e.Side, e.Currency, e.EntryPrice, nf(e.ExitPrice),
		e.Quantity, e.Fees, nf(e.StopLoss), nf(e.TakeProfit), e.OpenedAt, nt(e.ClosedAt), e.Strategy, e.Emotion, e.Notes, tags, ni(e.Rating), e.ContractSize))
	if err == sql.ErrNoRows {
		return out, httpx.ErrNotFound
	}
	return out, err
}

// DeleteJournal menghapus catatan milik pengguna.
func (p *PG) DeleteJournal(ctx context.Context, uid, id string) error {
	res, err := p.DB.ExecContext(ctx, qJournalDelete, id, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

func journalQueries() map[string]string {
	return map[string]string{"journal_list": qJournalList, "journal_count": qJournalCount, "journal_insert": qJournalInsert,
		"journal_update": qJournalUpdate, "journal_delete": qJournalDelete}
}
