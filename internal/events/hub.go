package events

import (
	"encoding/json"
	"sync"
	"time"
)

type Event struct {
	TenantID int64     `json:"tenantId,omitempty"`
	UserID   int64     `json:"userId,omitempty"`
	Type     string    `json:"type"`
	At       time.Time `json:"at"`
	Source   string    `json:"source,omitempty"`
	Data     any       `json:"data,omitempty"`
}

type Subscriber struct {
	TenantID, UserID int64
	C                chan []byte
}

type Hub struct {
	mu   sync.RWMutex
	subs map[*Subscriber]struct{}
}

func NewHub() *Hub { return &Hub{subs: map[*Subscriber]struct{}{}} }
func (h *Hub) Subscribe(tenantID, userID int64) *Subscriber {
	s := &Subscriber{TenantID: tenantID, UserID: userID, C: make(chan []byte, 64)}
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()
	return s
}
func (h *Hub) Unsubscribe(s *Subscriber) {
	h.mu.Lock()
	if _, ok := h.subs[s]; ok {
		delete(h.subs, s)
		close(s.C)
	}
	h.mu.Unlock()
}
func (h *Hub) Publish(e Event) {
	if e.At.IsZero() {
		e.At = time.Now().UTC()
	}
	b, _ := json.Marshal(e)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs {
		if e.TenantID != 0 && s.TenantID != e.TenantID {
			continue
		}
		if e.UserID != 0 && s.UserID != e.UserID {
			continue
		}
		select {
		case s.C <- b:
		default:
		}
	}
}
