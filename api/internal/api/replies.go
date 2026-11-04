package api

import (
	"net/http"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// notifyReply memberi tahu pemilik komentar induk bahwa komentarnya dibalas
// (kecuali membalas diri sendiri atau notifikasi "Balasan komentar" dimatikan).
func (s *Server) notifyReply(r *http.Request, kind, parentID, actorName, body string) {
	t, err := s.Store.ReplyTarget(r.Context(), kind, parentID)
	if err != nil || !t.Notify || t.UserID == uid(r) {
		return
	}
	if err := s.Store.Notify(r.Context(), t.UserID, store.NotifyInput{
		Kind:  "reply",
		Title: actorName + " membalas komentarmu",
		Body:  "Di \"" + cut(t.Title, 90) + "\": " + cut(body, 140),
		Link:  t.Link,
	}); err != nil {
		s.Log.Warn("notifikasi balasan gagal", "err", err)
	}
}
