package api

import (
	"net/http"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// notifyReply memberi tahu pemilik komentar induk bahwa komentarnya dibalas
// (kecuali membalas diri sendiri atau notifikasi "Balasan komentar" dimatikan).
func (s *Server) notifyReply(r *http.Request, kind, parentID, actorName, body string) {
	s.notifyReplyAs(r, kind, parentID, uid(r), actorName, body)
}

// notifyReplyAs: seperti notifyReply untuk balasan milik actorID (mis. saat moderator menyetujuinya).
func (s *Server) notifyReplyAs(r *http.Request, kind, parentID, actorID, actorName, body string) {
	t, err := s.Store.ReplyTarget(r.Context(), kind, parentID)
	if err != nil || !t.Notify || t.UserID == actorID {
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

// pendingReplies mencatat balasan yang akan disetujui; panggil fungsi hasil setelah status tersimpan.
func (s *Server) pendingReplies(r *http.Request, kind string, ids []string, status string) func() {
	if status != "visible" {
		return func() {}
	}
	list, err := s.Store.PendingReplies(r.Context(), kind, ids)
	if err != nil || len(list) == 0 {
		return func() {}
	}
	return func() {
		for _, x := range list {
			s.notifyReplyAs(r, kind, x.ParentID, x.ActorID, x.ActorName, x.Body)
		}
	}
}
