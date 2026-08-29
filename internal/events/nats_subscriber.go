package events

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// NATSSubscriber is a small reconnecting NATS text-protocol subscriber used to
// fan realtime events across multiple P2PFlow web instances. It intentionally
// supports only the protocol features P2PFlow needs (CONNECT/SUB/MSG/PING).
type NATSSubscriber struct {
	rawURL string
}

func NewNATSSubscriber(raw string) *NATSSubscriber {
	return &NATSSubscriber{rawURL: strings.TrimSpace(raw)}
}

func (n *NATSSubscriber) Enabled() bool { return n != nil && n.rawURL != "" }

// Run blocks until ctx is cancelled. Connection failures are retried with a
// bounded backoff so a temporary NATS outage never stops the HTTP server.
func (n *NATSSubscriber) Run(ctx context.Context, subject string, handler func(subject string, payload []byte)) {
	if !n.Enabled() || handler == nil {
		return
	}
	backoff := time.Second
	for ctx.Err() == nil {
		err := n.runOnce(ctx, subject, handler)
		if ctx.Err() != nil {
			return
		}
		if err == nil {
			backoff = time.Second
		}
		t := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		}
		if backoff < 15*time.Second {
			backoff *= 2
			if backoff > 15*time.Second {
				backoff = 15 * time.Second
			}
		}
	}
}

func (n *NATSSubscriber) runOnce(ctx context.Context, subject string, handler func(string, []byte)) error {
	u, err := url.Parse(n.rawURL)
	if err != nil {
		return err
	}
	host := u.Host
	if host == "" {
		return fmt.Errorf("NATS host is empty")
	}
	if !strings.Contains(host, ":") {
		host += ":4222"
	}
	d := net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", host)
	if err != nil {
		return err
	}
	defer conn.Close()
	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	line, err := r.ReadString('\n')
	if err != nil {
		return err
	}
	if !strings.HasPrefix(line, "INFO ") {
		return fmt.Errorf("invalid NATS greeting")
	}
	auth := map[string]any{"verbose": false, "pedantic": false, "lang": "go", "version": "p2pflow-2", "protocol": 1}
	if u.User != nil {
		if p, ok := u.User.Password(); ok {
			auth["user"] = u.User.Username()
			auth["pass"] = p
		} else if u.User.Username() != "" {
			auth["auth_token"] = u.User.Username()
		}
	}
	b, _ := json.Marshal(auth)
	if _, err = fmt.Fprintf(w, "CONNECT %s\r\nSUB %s 1\r\nPING\r\n", b, subject); err != nil {
		return err
	}
	if err = w.Flush(); err != nil {
		return err
	}
	_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		line, err = r.ReadString('\n')
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				if _, e := w.WriteString("PING\r\n"); e != nil {
					return e
				}
				if e := w.Flush(); e != nil {
					return e
				}
				_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
				continue
			}
			return err
		}
		_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		line = strings.TrimSpace(line)
		switch {
		case line == "PING":
			if _, err = w.WriteString("PONG\r\n"); err != nil {
				return err
			}
			if err = w.Flush(); err != nil {
				return err
			}
		case line == "PONG" || strings.HasPrefix(line, "+OK"):
			continue
		case strings.HasPrefix(line, "-ERR"):
			return fmt.Errorf("NATS %s", line)
		case strings.HasPrefix(line, "MSG "):
			parts := strings.Fields(line)
			if len(parts) != 4 && len(parts) != 5 {
				return fmt.Errorf("invalid NATS MSG header")
			}
			nBytes, e := strconv.Atoi(parts[len(parts)-1])
			if e != nil || nBytes < 0 || nBytes > 16<<20 {
				return fmt.Errorf("invalid NATS payload size")
			}
			payload := make([]byte, nBytes+2)
			if _, e = io.ReadFull(r, payload); e != nil {
				return e
			}
			if nBytes > 0 {
				handler(parts[1], append([]byte(nil), payload[:nBytes]...))
			} else {
				handler(parts[1], nil)
			}
		}
	}
}
