package api

import (
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= pengguna

var userTabs = map[string]bool{"": true, "reader": true, "staff": true, "reported": true, "blocked": true}

// GET /v1/admin/users?tab=&q=
func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.read"); err != nil {
		return err
	}
	q := r.URL.Query()
	tab := q.Get("tab")
	if tab == "all" {
		tab = ""
	}
	if !userTabs[tab] {
		return httpx.BadRequest("Tab tidak dikenal.")
	}
	list, st, err := s.Store.AdminUsers(r.Context(), tab, strings.TrimSpace(q.Get("q")), limitParam(r, 50, 500))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": list, "stats": st})
	return nil
}

// GET /v1/admin/users/{id}
func (s *Server) adminUserDetail(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.read"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	u, err := s.Store.AdminUser(r.Context(), id)
	if err != nil {
		return err
	}
	days, warns, err := s.Store.UserActivity(r.Context(), id)
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"user": u, "activity": days, "warnings": warns})
	return nil
}

// guardTarget: staf tidak bisa menindak dirinya sendiri, dan pengelola RBAC hanya bisa ditindak pengelola RBAC.
func (s *Server) guardTarget(r *http.Request, id string) error {
	if id == claims(r).Sub {
		return httpx.Forbidden("Tidak bisa menindak akun sendiri.")
	}
	target, err := s.Store.UserAccess(r.Context(), id)
	if err != nil {
		return err
	}
	if target.Has("rbac.manage") && !can(r, "rbac.manage") {
		return httpx.Forbidden("Akun pengelola RBAC hanya bisa ditindak Super Admin.")
	}
	return nil
}

// POST /v1/admin/users/{id}/suspend {days (0 = permanen), reason}
func (s *Server) suspendUser(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.ban"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Days   int    `json:"days"`
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Days < 0 || in.Days > 365 {
		return httpx.Validation(map[string]string{"days": "Lama blokir 0–365 hari (0 = permanen)."})
	}
	if utf8.RuneCountInString(in.Reason) > 300 {
		return httpx.Validation(map[string]string{"reason": "Alasan maksimal 300 karakter."})
	}
	if err := s.guardTarget(r, id); err != nil {
		return err
	}
	var until *time.Time
	if in.Days > 0 {
		t := s.Now().Add(time.Duration(in.Days) * 24 * time.Hour)
		until = &t
	}
	if err := s.Store.BlockUser(r.Context(), id, until, in.Reason); err != nil {
		return err
	}
	s.audit(r, "users.block", id, map[string]any{"days": in.Days, "reason": in.Reason})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/admin/users/{id}/unblock
func (s *Server) unblockUser(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.ban"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.UnblockUser(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "users.unblock", id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/admin/users/{id}/warn {reason}
func (s *Server) warnUser(w http.ResponseWriter, r *http.Request) error {
	if !can(r, "users.ban") && !can(r, "comments.moderate") {
		return httpx.Forbidden("Peran Anda tidak boleh mengirim peringatan.")
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if n := utf8.RuneCountInString(in.Reason); n < 3 || n > 300 {
		return httpx.Validation(map[string]string{"reason": "Isi peringatan 3–300 karakter."})
	}
	if err := s.guardTarget(r, id); err != nil {
		return err
	}
	if err := s.Store.WarnUser(r.Context(), id, claims(r).Sub, in.Reason); err != nil {
		return err
	}
	s.audit(r, "users.warn", id, map[string]any{"reason": in.Reason})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ======================================================================= iklan

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func optURL(p **string, https bool) bool {
	if *p == nil {
		return true
	}
	v := strings.TrimSpace(**p)
	if v == "" {
		*p = nil
		return true
	}
	*p = &v
	if strings.HasPrefix(v, "/") && !https {
		return !strings.HasPrefix(v, "//")
	}
	u, err := url.Parse(v)
	return err == nil && u.Scheme == "https" && u.Host != "" && len(v) <= 500
}

func validCampaign(in *store.CampaignInput) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Advertiser = strings.TrimSpace(in.Advertiser)
	in.Industry = strings.TrimSpace(strings.ToLower(in.Industry))
	in.SlotCode = strings.TrimSpace(in.SlotCode)
	in.Note = strings.TrimSpace(in.Note)
	f := map[string]string{}
	if n := utf8.RuneCountInString(in.Name); n < 3 || n > 80 {
		f["name"] = "Nama kampanye 3–80 karakter."
	}
	if n := utf8.RuneCountInString(in.Advertiser); n < 2 || n > 80 {
		f["advertiser"] = "Nama pengiklan 2–80 karakter."
	}
	if utf8.RuneCountInString(in.Industry) > 40 {
		f["industry"] = "Industri maksimal 40 karakter."
	}
	if in.SlotCode == "" {
		f["slot_code"] = "Pilih slot iklan."
	}
	start, e1 := time.Parse("2006-01-02", in.StartDate)
	end, e2 := time.Parse("2006-01-02", in.EndDate)
	switch {
	case !dateRe.MatchString(in.StartDate) || e1 != nil:
		f["start_date"] = "Tanggal mulai tidak valid."
	case !dateRe.MatchString(in.EndDate) || e2 != nil:
		f["end_date"] = "Tanggal selesai tidak valid."
	case end.Before(start):
		f["end_date"] = "Tanggal selesai harus setelah tanggal mulai."
	case end.Sub(start) > 366*24*time.Hour:
		f["end_date"] = "Periode kampanye maksimal 1 tahun."
	}
	if !optURL(&in.CreativeURL, false) {
		f["creative_url"] = "URL materi harus https:// atau /v1/media/…"
	}
	if !optURL(&in.TargetURL, true) {
		f["target_url"] = "URL tujuan harus https://"
	}
	if in.BudgetUSD < 0 || in.BudgetUSD > 10_000_000 {
		f["budget_usd"] = "Anggaran tidak valid."
	}
	if utf8.RuneCountInString(in.Note) > 500 {
		f["note"] = "Catatan maksimal 500 karakter."
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	return nil
}

// docsMissing: dokumen wajib sebelum kampanye boleh tayang.
func docsMissing(c store.Campaign) []string {
	var miss []string
	if !c.DocsCompany {
		miss = append(miss, "akta & NIB perusahaan")
	}
	if c.Regulated && !c.DocsLicense {
		miss = append(miss, "izin OJK/Bappebti")
	}
	if !c.DocsCreative {
		miss = append(miss, "materi kreatif")
	}
	if !c.DocsClaims {
		miss = append(miss, "klaim & disclaimer risiko")
	}
	return miss
}

func canSeeAds(r *http.Request) error {
	if can(r, "ads.manage") || can(r, "revenue.read") {
		return nil
	}
	return httpx.Forbidden("Peran Anda tidak punya akses ke iklan.")
}

// GET /v1/admin/ads
func (s *Server) adminAds(w http.ResponseWriter, r *http.Request) error {
	if err := canSeeAds(r); err != nil {
		return err
	}
	cs, err := s.Store.Campaigns(r.Context())
	if err != nil {
		return err
	}
	slots, err := s.Store.AdminSlots(r.Context())
	if err != nil {
		return err
	}
	counts := map[string]int{"pending": 0, "live": 0, "paused": 0, "rejected": 0, "finished": 0}
	for _, c := range cs {
		counts[c.Status]++
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"campaigns": cs, "slots": slots, "counts": counts, "can_manage": can(r, "ads.manage")})
	return nil
}

// POST /v1/admin/ads/campaigns
func (s *Server) createCampaign(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "ads.manage"); err != nil {
		return err
	}
	var in store.CampaignInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validCampaign(&in); err != nil {
		return err
	}
	id, err := s.Store.CreateCampaign(r.Context(), in, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "ads.create", id, map[string]any{"name": in.Name, "advertiser": in.Advertiser, "slot": in.SlotCode})
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "status": "pending"})
	return nil
}

// PUT /v1/admin/ads/campaigns/{id}
func (s *Server) updateCampaign(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "ads.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in store.CampaignInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validCampaign(&in); err != nil {
		return err
	}
	if err := s.Store.UpdateCampaign(r.Context(), id, in); err != nil {
		return err
	}
	c, err := s.Store.CampaignByID(r.Context(), id)
	if err != nil {
		return err
	}
	// Kampanye tayang yang dokumennya dicabut otomatis kembali menunggu verifikasi.
	if c.Status == "live" && len(docsMissing(c)) > 0 {
		if err := s.Store.SetCampaignStatus(r.Context(), id, "pending", ""); err != nil {
			return err
		}
		c.Status = "pending"
	}
	s.audit(r, "ads.update", id, map[string]any{"name": in.Name, "status": c.Status})
	httpx.JSON(w, 200, c)
	return nil
}

// POST /v1/admin/ads/campaigns/{id}/status {action: approve|reject|pause|resume|finish|request_docs, note}
func (s *Server) campaignStatus(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "ads.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Note = strings.TrimSpace(in.Note)
	if utf8.RuneCountInString(in.Note) > 500 {
		return httpx.Validation(map[string]string{"note": "Catatan maksimal 500 karakter."})
	}
	c, err := s.Store.CampaignByID(r.Context(), id)
	if err != nil {
		return err
	}
	var to string
	switch in.Action {
	case "approve", "resume":
		if c.Status != "pending" && c.Status != "paused" {
			return httpx.Conflict("Hanya kampanye menunggu/dijeda yang bisa ditayangkan.")
		}
		if miss := docsMissing(c); len(miss) > 0 {
			return httpx.Validation(map[string]string{"docs": "Dokumen belum lengkap: " + strings.Join(miss, ", ") + "."})
		}
		if c.EndDate < s.Now().Format("2006-01-02") {
			return httpx.Validation(map[string]string{"end_date": "Periode kampanye sudah lewat."})
		}
		to = "live"
	case "reject":
		if c.Status == "finished" {
			return httpx.Conflict("Kampanye sudah selesai.")
		}
		if in.Note == "" {
			return httpx.Validation(map[string]string{"note": "Tulis alasan penolakan."})
		}
		to = "rejected"
	case "pause":
		if c.Status != "live" {
			return httpx.Conflict("Hanya kampanye tayang yang bisa dijeda.")
		}
		to = "paused"
	case "finish":
		if c.Status != "live" && c.Status != "paused" {
			return httpx.Conflict("Hanya kampanye tayang/dijeda yang bisa diselesaikan.")
		}
		to = "finished"
	case "request_docs":
		if c.Status != "pending" {
			return httpx.Conflict("Permintaan dokumen hanya untuk kampanye menunggu.")
		}
		miss := docsMissing(c)
		if len(miss) == 0 {
			return httpx.Validation(map[string]string{"docs": "Semua dokumen sudah diterima."})
		}
		if in.Note == "" {
			in.Note = "Mohon lengkapi: " + strings.Join(miss, ", ") + "."
		}
		to = "pending"
	default:
		return httpx.Validation(map[string]string{"action": "Aksi tidak dikenal."})
	}
	if err := s.Store.SetCampaignStatus(r.Context(), id, to, in.Note); err != nil {
		return err
	}
	s.audit(r, "ads."+in.Action, id, map[string]any{"name": c.Name, "before": c.Status, "after": to, "note": in.Note})
	c, err = s.Store.CampaignByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, c)
	return nil
}

// DELETE /v1/admin/ads/campaigns/{id} — hanya kampanye yang belum pernah tayang.
func (s *Server) deleteCampaign(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "ads.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	c, err := s.Store.CampaignByID(r.Context(), id)
	if err != nil {
		return err
	}
	if c.Status != "pending" && c.Status != "rejected" {
		return httpx.Conflict("Kampanye yang pernah tayang tidak bisa dihapus (catatan pendapatan). Selesaikan saja.")
	}
	if err := s.Store.DeleteCampaign(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "ads.delete", id, map[string]any{"name": c.Name})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PATCH /v1/admin/ads/slots/{code} {active}
func (s *Server) setSlot(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "ads.manage"); err != nil {
		return err
	}
	code := r.PathValue("code")
	if !slugLike.MatchString(code) {
		return httpx.NotFound("Slot tidak ditemukan.")
	}
	var in struct {
		Active bool `json:"active"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetSlotActive(r.Context(), code, in.Active); err != nil {
		return err
	}
	s.audit(r, "ads.slot", code, map[string]any{"active": in.Active})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

var slugLike = regexp.MustCompile(`^[a-z0-9_-]{2,60}$`)

// ======================================================================= data pasar

// MarketAlerts adalah aturan peringatan feed.
type MarketAlerts struct {
	Latency   bool `json:"latency"`
	RateLimit bool `json:"rate_limit"`
	Quota     bool `json:"quota"`
	WSDrop    bool `json:"ws_drop"`
}

// Batas kredit harian paket Twelve Data (Basic: 800/hari).
const dailyCredits = 800

func canSeeMarket(r *http.Request) error {
	if can(r, "market.read") || can(r, "market.manage") {
		return nil
	}
	return httpx.Forbidden("Peran Anda tidak punya akses ke data pasar.")
}

func (s *Server) marketAlerts(r *http.Request) MarketAlerts {
	a := MarketAlerts{Latency: true, RateLimit: true, Quota: true}
	_, _ = s.Store.Setting(r.Context(), "market_alerts", &a)
	return a
}

// GET /v1/admin/market
func (s *Server) adminMarket(w http.ResponseWriter, r *http.Request) error {
	if err := canSeeMarket(r); err != nil {
		return err
	}
	feed, err := s.Store.MarketFeed(r.Context())
	if err != nil {
		return err
	}
	st, err := s.Store.MarketStats(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{
		"data": feed, "stats": st, "alerts": s.marketAlerts(r), "daily_credits": dailyCredits,
		"quote_ttl_s": int(s.Cfg.QuoteTTL.Seconds()), "can_manage": can(r, "market.manage"),
	})
	return nil
}

var symbolRe = regexp.MustCompile(`^[A-Z0-9./:-]{1,24}$`)

// GET /v1/admin/market/{symbol}
func (s *Server) adminSymbol(w http.ResponseWriter, r *http.Request) error {
	if err := canSeeMarket(r); err != nil {
		return err
	}
	sym := strings.ToUpper(r.PathValue("symbol"))
	if !symbolRe.MatchString(sym) {
		return httpx.NotFound("Simbol tidak ditemukan.")
	}
	row, err := s.Store.FeedRowBySymbol(r.Context(), sym)
	if err != nil {
		return err
	}
	arts, err := s.Store.SymbolArticles(r.Context(), sym, 10)
	if err != nil {
		return err
	}
	var quote *market.Quote
	if row.Active {
		if q, err := s.Market.Quote(r.Context(), row.ProviderSymbol); err == nil {
			quote = &q
		}
	}
	al := SymbolAlerts{Move3: true, Halt: true}
	_, _ = s.Store.Setting(r.Context(), "symbol_alerts:"+sym, &al)
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"instrument": row, "quote": quote, "articles": arts, "alerts": al, "can_manage": can(r, "market.manage")})
	return nil
}

var assetClasses = map[string]bool{"equity": true, "index": true, "crypto": true, "commodity": true, "forex": true}

func validInstrument(in *store.InstrumentInput) error {
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	in.Name = strings.TrimSpace(in.Name)
	in.ProviderSymbol = strings.ToUpper(strings.TrimSpace(in.ProviderSymbol))
	in.Exchange = strings.ToUpper(strings.TrimSpace(in.Exchange))
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.ProviderSymbol == "" {
		in.ProviderSymbol = in.Symbol
	}
	if in.Exchange == "" {
		if i := strings.LastIndex(in.ProviderSymbol, ":"); i > 0 {
			in.Exchange = in.ProviderSymbol[i+1:]
		}
	}
	if in.Currency == "" {
		in.Currency = "USD"
		if in.Exchange == "IDX" {
			in.Currency = "IDR"
		}
	}
	for _, p := range []**string{&in.Sector, &in.CategorySlug} {
		if *p != nil {
			v := strings.TrimSpace(**p)
			if v == "" {
				*p = nil
			} else {
				*p = &v
			}
		}
	}
	f := map[string]string{}
	if !symbolRe.MatchString(in.Symbol) {
		f["symbol"] = "Kode simbol huruf besar/angka (mis. BBCA, BTCUSD)."
	}
	if n := utf8.RuneCountInString(in.Name); n < 2 || n > 80 {
		f["name"] = "Nama tampilan 2–80 karakter."
	}
	if !symbolRe.MatchString(in.ProviderSymbol) {
		f["provider_symbol"] = "Kode Twelve Data tidak valid (mis. BBCA:IDX, BTC/USD)."
	}
	if in.Exchange == "" || len(in.Exchange) > 20 {
		f["exchange"] = "Bursa/sumber wajib diisi."
	}
	if !assetClasses[in.AssetClass] {
		f["asset_class"] = "Kelas aset tidak dikenal."
	}
	if len(in.Currency) != 3 {
		f["currency"] = "Mata uang 3 huruf (IDR, USD)."
	}
	if in.CategorySlug != nil && !slugRe.MatchString(*in.CategorySlug) {
		f["category_slug"] = "Kategori tidak valid."
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	return nil
}

// POST /v1/admin/market/instruments
func (s *Server) createInstrument(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "market.manage"); err != nil {
		return err
	}
	var in store.InstrumentInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validInstrument(&in); err != nil {
		return err
	}
	if err := s.Store.CreateInstrument(r.Context(), in); err != nil {
		return err
	}
	s.audit(r, "market.create", in.Symbol, map[string]any{"name": in.Name, "provider_symbol": in.ProviderSymbol})
	httpx.JSON(w, http.StatusCreated, map[string]string{"symbol": in.Symbol})
	return nil
}

// PUT /v1/admin/market/instruments/{symbol}
func (s *Server) updateInstrument(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "market.manage"); err != nil {
		return err
	}
	var in store.InstrumentInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Symbol = r.PathValue("symbol")
	if err := validInstrument(&in); err != nil {
		return err
	}
	before, err := s.Store.FeedRowBySymbol(r.Context(), in.Symbol)
	if err != nil {
		return err
	}
	if err := s.Store.UpdateInstrument(r.Context(), in); err != nil {
		return err
	}
	s.audit(r, "market.update", in.Symbol, map[string]any{
		"before": map[string]any{"name": before.Name, "provider_symbol": before.ProviderSymbol, "in_ticker": before.InTicker, "saver_mode": before.SaverMode},
		"after":  map[string]any{"name": in.Name, "provider_symbol": in.ProviderSymbol, "in_ticker": in.InTicker, "saver_mode": in.SaverMode},
	})
	httpx.JSON(w, 200, map[string]string{"symbol": in.Symbol})
	return nil
}

// POST /v1/admin/market/instruments/{symbol}/active {active}
func (s *Server) instrumentActive(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "market.manage"); err != nil {
		return err
	}
	sym := strings.ToUpper(r.PathValue("symbol"))
	var in struct {
		Active bool `json:"active"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetInstrumentActive(r.Context(), sym, in.Active); err != nil {
		return err
	}
	s.audit(r, "market.active", sym, map[string]any{"active": in.Active})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PUT /v1/admin/market/alerts
func (s *Server) setMarketAlerts(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "market.manage"); err != nil {
		return err
	}
	var in MarketAlerts
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetSetting(r.Context(), "market_alerts", in, claims(r).Sub); err != nil {
		return err
	}
	s.audit(r, "settings.market_alerts", "", map[string]any{"after": in})
	httpx.JSON(w, 200, in)
	return nil
}

// SymbolAlerts adalah alert internal redaksi per simbol.
type SymbolAlerts struct {
	Move3    bool `json:"move3"`    // naik/turun > 3% dalam sehari
	Halt     bool `json:"halt"`     // auto-reject / suspensi bursa
	Volume3x bool `json:"volume3x"` // volume 3× rata-rata
}

// PUT /v1/admin/market/instruments/{symbol}/alerts
func (s *Server) setSymbolAlerts(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "market.manage"); err != nil {
		return err
	}
	sym := strings.ToUpper(r.PathValue("symbol"))
	if _, err := s.Store.FeedRowBySymbol(r.Context(), sym); err != nil {
		return err
	}
	var in SymbolAlerts
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetSetting(r.Context(), "symbol_alerts:"+sym, in, claims(r).Sub); err != nil {
		return err
	}
	s.audit(r, "market.alerts", sym, map[string]any{"after": in})
	httpx.JSON(w, 200, in)
	return nil
}

// POST /v1/admin/market/test {symbol} — ambil harga langsung dari penyedia (melewati cache).
func (s *Server) testMarket(w http.ResponseWriter, r *http.Request) error {
	if err := canSeeMarket(r); err != nil {
		return err
	}
	var in struct {
		Symbol string `json:"symbol"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	sym := strings.ToUpper(strings.TrimSpace(in.Symbol))
	if sym == "" {
		sym = "BTCUSD"
	}
	row, err := s.Store.FeedRowBySymbol(r.Context(), sym)
	if err != nil {
		return err
	}
	start := time.Now()
	q, qerr := s.Market.Quote(market.WithFresh(r.Context()), row.ProviderSymbol)
	ms := time.Since(start).Milliseconds()
	s.audit(r, "market.test", sym, map[string]any{"ok": qerr == nil, "latency_ms": ms})
	if qerr != nil {
		msg := qerr.Error()
		switch {
		case errors.Is(qerr, market.ErrUnavailable):
			msg = "Simbol tidak tersedia di paket penyedia data."
		case errors.Is(qerr, market.ErrBusy):
			msg = "Kuota per menit sedang habis (429). Coba lagi sebentar."
		}
		httpx.JSON(w, 200, map[string]any{"ok": false, "symbol": sym, "latency_ms": ms, "error": msg})
		return nil
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "symbol": sym, "latency_ms": ms, "price": q.Price, "source": q.Source, "as_of": q.AsOf})
	return nil
}
