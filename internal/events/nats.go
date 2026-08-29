package events

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

// NATSPublisher implements the small subset of the NATS text protocol P2PFlow
// needs for outbox publishing, avoiding a mandatory client dependency.
type NATSPublisher struct {
	rawURL string
	mu     sync.Mutex
	conn   net.Conn
	rw     *bufio.ReadWriter
}

func NewNATSPublisher(raw string) *NATSPublisher {
	return &NATSPublisher{rawURL: strings.TrimSpace(raw)}
}
func (n *NATSPublisher) Enabled() bool { return n != nil && n.rawURL != "" }
func (n *NATSPublisher) Close() {
	n.mu.Lock()
	if n.conn != nil {
		_ = n.conn.Close()
	}
	n.conn = nil
	n.rw = nil
	n.mu.Unlock()
}
func (n *NATSPublisher) connect(ctx context.Context) error {
	if n.conn != nil {
		return nil
	}
	u, err := url.Parse(n.rawURL)
	if err != nil {
		return err
	}
	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":4222"
	}
	d := net.Dialer{Timeout: 3 * time.Second}
	c, err := d.DialContext(ctx, "tcp", host)
	if err != nil {
		return err
	}
	rw := bufio.NewReadWriter(bufio.NewReader(c), bufio.NewWriter(c))
	_ = c.SetDeadline(time.Now().Add(3 * time.Second))
	line, err := rw.ReadString('\n')
	if err != nil {
		c.Close()
		return err
	}
	if !strings.HasPrefix(line, "INFO ") {
		c.Close()
		return fmt.Errorf("invalid NATS greeting")
	}
	auth := map[string]any{"verbose": false, "pedantic": false, "lang": "go", "version": "p2pflow-2", "protocol": 1}
	if u.User != nil {
		if p, ok := u.User.Password(); ok {
			auth["user"] = u.User.Username()
			auth["pass"] = p
		} else {
			auth["auth_token"] = u.User.Username()
		}
	}
	b, _ := json.Marshal(auth)
	fmt.Fprintf(rw, "CONNECT %s\r\nPING\r\n", b)
	if err := rw.Flush(); err != nil {
		c.Close()
		return err
	}
	for {
		line, err = rw.ReadString('\n')
		if err != nil {
			c.Close()
			return err
		}
		if strings.HasPrefix(line, "PONG") {
			break
		}
		if strings.HasPrefix(line, "-ERR") {
			c.Close()
			return fmt.Errorf("NATS %s", strings.TrimSpace(line))
		}
	}
	_ = c.SetDeadline(time.Time{})
	n.conn = c
	n.rw = rw
	return nil
}
func (n *NATSPublisher) Publish(ctx context.Context, subject string, payload []byte) error {
	if !n.Enabled() {
		return nil
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.connect(ctx); err != nil {
		return err
	}
	_ = n.conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := fmt.Fprintf(n.rw, "PUB %s %d\r\n", subject, len(payload)); err != nil {
		n.resetLocked()
		return err
	}
	if _, err := n.rw.Write(payload); err != nil {
		n.resetLocked()
		return err
	}
	if _, err := n.rw.WriteString("\r\nPING\r\n"); err != nil {
		n.resetLocked()
		return err
	}
	if err := n.rw.Flush(); err != nil {
		n.resetLocked()
		return err
	}
	// PONG is a lightweight server-side processing barrier for everything sent
	// before the PING, so the durable outbox can safely mark the event published.
	for {
		line, err := n.rw.ReadString('\n')
		if err != nil {
			n.resetLocked()
			return err
		}
		line = strings.TrimSpace(line)
		switch {
		case line == "PONG":
			_ = n.conn.SetDeadline(time.Time{})
			return nil
		case line == "PING":
			if _, err = n.rw.WriteString("PONG\r\n"); err != nil {
				n.resetLocked()
				return err
			}
			if err = n.rw.Flush(); err != nil {
				n.resetLocked()
				return err
			}
		case strings.HasPrefix(line, "-ERR"):
			n.resetLocked()
			return fmt.Errorf("NATS %s", line)
		}
	}
}

func (n *NATSPublisher) resetLocked() {
	if n.conn != nil {
		_ = n.conn.Close()
	}
	n.conn = nil
	n.rw = nil
}
