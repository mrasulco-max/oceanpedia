// Package handler adalah entrypoint Vercel Function (runtime Go).
// Semua path diarahkan ke sini lewat vercel.json; router yang menangani /v1/*.
// Builder Vercel mengompilasi file ini di luar pohon modul, jadi hanya boleh
// mengimpor paket publik (bukan internal/).
package handler

import (
	"net/http"

	"github.com/mrasulco-max/oceanpedia/api/pkg/serverless"
)

// Handler dipanggil Vercel untuk setiap request.
func Handler(w http.ResponseWriter, r *http.Request) {
	serverless.ServeHTTP(w, r)
}
