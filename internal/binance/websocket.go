package binance

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

// WSConn is a deliberately small RFC6455 client used for Binance C2C chat.
// It supports TLS, masking, fragmented server messages and ping/pong without
// introducing another mandatory dependency into the deployment.
type WSConn struct {
	conn    net.Conn
	rw      *bufio.ReadWriter
	writeMu sync.Mutex
}

func DialWebSocket(ctx context.Context, rawURL string) (*WSConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "wss" && u.Scheme != "ws" {
		return nil, fmt.Errorf("unsupported websocket scheme %s", u.Scheme)
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		if u.Scheme == "wss" {
			port = "443"
		} else {
			port = "80"
		}
	}
	addr := net.JoinHostPort(host, port)
	d := net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
	var c net.Conn
	if u.Scheme == "wss" {
		td := tls.Dialer{NetDialer: &d, Config: &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}}
		c, err = td.DialContext(ctx, "tcp", addr)
	} else {
		c, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, err
	}
	keyRaw := make([]byte, 16)
	if _, err = rand.Read(keyRaw); err != nil {
		c.Close()
		return nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyRaw)
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	if u.RawQuery != "" {
		path += "?" + u.RawQuery
	}
	rw := bufio.NewReadWriter(bufio.NewReader(c), bufio.NewWriter(c))
	fmt.Fprintf(rw, "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\nUser-Agent: P2PFlow/2.0\r\n\r\n", path, u.Host, key)
	if err := rw.Flush(); err != nil {
		c.Close()
		return nil, err
	}
	status, err := rw.ReadString('\n')
	if err != nil {
		c.Close()
		return nil, err
	}
	if !strings.Contains(status, " 101 ") {
		c.Close()
		return nil, fmt.Errorf("websocket upgrade failed: %s", strings.TrimSpace(status))
	}
	headers := map[string]string{}
	for {
		line, err := rw.ReadString('\n')
		if err != nil {
			c.Close()
			return nil, err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		if i := strings.IndexByte(line, ':'); i > 0 {
			headers[strings.ToLower(strings.TrimSpace(line[:i]))] = strings.TrimSpace(line[i+1:])
		}
	}
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	want := base64.StdEncoding.EncodeToString(sum[:])
	if headers["sec-websocket-accept"] != want {
		c.Close()
		return nil, errors.New("websocket accept validation failed")
	}
	return &WSConn{conn: c, rw: rw}, nil
}
func (w *WSConn) Close() error {
	if w == nil || w.conn == nil {
		return nil
	}
	_ = w.writeFrame(0x8, []byte{})
	return w.conn.Close()
}
func (w *WSConn) WriteJSON(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return w.writeFrame(0x1, b)
}
func (w *WSConn) WriteText(b []byte) error { return w.writeFrame(0x1, b) }
func (w *WSConn) writeFrame(op byte, payload []byte) error {
	w.writeMu.Lock()
	defer w.writeMu.Unlock()
	if w.conn == nil {
		return io.ErrClosedPipe
	}
	h := []byte{0x80 | op}
	n := len(payload)
	switch {
	case n < 126:
		h = append(h, byte(0x80|n))
	case n <= 65535:
		h = append(h, 0x80|126, byte(n>>8), byte(n))
	default:
		h = append(h, 0x80|127)
		x := make([]byte, 8)
		binary.BigEndian.PutUint64(x, uint64(n))
		h = append(h, x...)
	}
	mask := make([]byte, 4)
	if _, err := rand.Read(mask); err != nil {
		return err
	}
	h = append(h, mask...)
	masked := make([]byte, n)
	for i := range payload {
		masked[i] = payload[i] ^ mask[i%4]
	}
	if _, err := w.rw.Write(h); err != nil {
		return err
	}
	if _, err := w.rw.Write(masked); err != nil {
		return err
	}
	return w.rw.Flush()
}
func (w *WSConn) ReadMessage(ctx context.Context) (byte, []byte, error) {
	var total []byte
	var firstOp byte
	for {
		if dl, ok := ctx.Deadline(); ok {
			_ = w.conn.SetReadDeadline(dl)
		} else {
			_ = w.conn.SetReadDeadline(time.Time{})
		}
		b1, err := w.rw.ReadByte()
		if err != nil {
			return 0, nil, err
		}
		b2, err := w.rw.ReadByte()
		if err != nil {
			return 0, nil, err
		}
		fin := b1&0x80 != 0
		op := b1 & 0x0f
		masked := b2&0x80 != 0
		n := uint64(b2 & 0x7f)
		if n == 126 {
			x := make([]byte, 2)
			if _, err = io.ReadFull(w.rw, x); err != nil {
				return 0, nil, err
			}
			n = uint64(binary.BigEndian.Uint16(x))
		} else if n == 127 {
			x := make([]byte, 8)
			if _, err = io.ReadFull(w.rw, x); err != nil {
				return 0, nil, err
			}
			n = binary.BigEndian.Uint64(x)
		}
		if n > 16<<20 {
			return 0, nil, errors.New("websocket frame too large")
		}
		var mask []byte
		if masked {
			mask = make([]byte, 4)
			if _, err = io.ReadFull(w.rw, mask); err != nil {
				return 0, nil, err
			}
		}
		p := make([]byte, int(n))
		if _, err = io.ReadFull(w.rw, p); err != nil {
			return 0, nil, err
		}
		if masked {
			for i := range p {
				p[i] ^= mask[i%4]
			}
		}
		switch op {
		case 0x8:
			return op, p, io.EOF
		case 0x9:
			_ = w.writeFrame(0xA, p)
			continue
		case 0xA:
			continue
		case 0x1, 0x2:
			firstOp = op
			total = append(total, p...)
		case 0x0:
			if firstOp == 0 {
				continue
			}
			total = append(total, p...)
		default:
			continue
		}
		if fin {
			return firstOp, total, nil
		}
	}
}
