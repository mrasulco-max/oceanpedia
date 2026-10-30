// Package migrations menyimpan berkas SQL migrasi yang ditanam ke biner API.
package migrations

import "embed"

// FS berisi seluruh berkas *.up.sql dan *.down.sql.
//
//go:embed *.sql
var FS embed.FS
