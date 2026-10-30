package store

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
	"time"
)

// TestDumpQueries menulis semua query sebagai PREPARE agar bisa divalidasi psql (lihat scripts/check-sql.sh).
func TestDumpQueries(t *testing.T) {
	out := os.Getenv("SQL_DUMP")
	if out == "" {
		t.Skip("set SQL_DUMP untuk menulis berkas validasi")
	}
	qs := AllQueries()
	keys := make([]string, 0, len(qs))
	for k := range qs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("\\set ON_ERROR_STOP on\nBEGIN;\n")
	for _, k := range keys {
		fmt.Fprintf(&b, "PREPARE q_%s AS %s;\n", k, qs[k])
	}
	b.WriteString("ROLLBACK;\n")
	if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBuildArticlesQuery(t *testing.T) {
	now := time.Now()
	q, args := BuildArticlesQuery(ArticleFilter{Category: "saham", Query: "bank", Before: &now, Limit: 20})
	if len(args) != 4 || args[3] != 20 {
		t.Fatalf("args tak terduga: %#v", args)
	}
	for _, want := range []string{"c.slug = $1", "websearch_to_tsquery('simple', $2)", "a.published_at < $3", "LIMIT $4"} {
		if !strings.Contains(q, want) {
			t.Errorf("query tidak memuat %q:\n%s", want, q)
		}
	}
}

func TestPgTextArray(t *testing.T) {
	if got := pgTextArray([]string{"BBCA", `a"b`}); got != `{"BBCA","a\"b"}` {
		t.Fatalf("got %s", got)
	}
	if got := pgTextArray(nil); got != "{}" {
		t.Fatalf("nil -> %s", got)
	}
}
