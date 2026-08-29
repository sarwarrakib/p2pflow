package migrate

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Apply runs each migration exactly once. It deliberately executes statements
// one-by-one so MySQL/MariaDB do not require the multiStatements DSN flag.
func Apply(ctx context.Context, db *sql.DB, driver, root string) error {
	if err := ensureMigrationTable(ctx, db, driver); err != nil {
		return err
	}
	dir := filepath.Join(root, driver)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		var exists int
		q := "SELECT COUNT(*) FROM schema_migrations WHERE version=" + bind(driver, 1)
		if err := db.QueryRowContext(ctx, q, name).Scan(&exists); err != nil {
			return fmt.Errorf("migration lookup %s: %w", name, err)
		}
		if exists > 0 {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		statements, err := splitSQL(string(b))
		if err != nil {
			return fmt.Errorf("migration %s parse: %w", name, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("migration %s begin: %w", name, err)
		}
		ok := false
		defer func() {
			if !ok {
				_ = tx.Rollback()
			}
		}()
		for _, stmt := range statements {
			normalized := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(stmt), ";"))
			if normalized == "" || strings.EqualFold(normalized, "BEGIN") || strings.EqualFold(normalized, "START TRANSACTION") || strings.EqualFold(normalized, "COMMIT") {
				continue
			}
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("migration %s statement %.120q: %w", name, normalized, err)
			}
		}
		iq := "INSERT INTO schema_migrations(version,applied_at) VALUES(" + bind(driver, 1) + ",CURRENT_TIMESTAMP)"
		if _, err := tx.ExecContext(ctx, iq, name); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s record: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("migration %s commit: %w", name, err)
		}
		ok = true
	}
	return nil
}

func ensureMigrationTable(ctx context.Context, db *sql.DB, driver string) error {
	stmt := `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`
	if driver == "mysql" || driver == "mariadb" {
		stmt = `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`
	}
	if _, err := db.ExecContext(ctx, stmt); err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}
	return nil
}
func bind(driver string, n int) string {
	if driver == "postgres" {
		return fmt.Sprintf("$%d", n)
	}
	return "?"
}

// splitSQL understands SQL quoted strings, PostgreSQL dollar-quoted blocks and
// line/block comments. The current migrations intentionally contain no stored
// procedures, but supporting dollar quotes keeps the runner future-safe.
func splitSQL(src string) ([]string, error) {
	var out []string
	var b strings.Builder
	var single, double, backtick, lineComment, blockComment bool
	var dollarTag string
	for i := 0; i < len(src); i++ {
		c := src[i]
		var next byte
		if i+1 < len(src) {
			next = src[i+1]
		}
		if lineComment {
			b.WriteByte(c)
			if c == '\n' {
				lineComment = false
			}
			continue
		}
		if blockComment {
			b.WriteByte(c)
			if c == '*' && next == '/' {
				b.WriteByte(next)
				i++
				blockComment = false
			}
			continue
		}
		if dollarTag != "" {
			if strings.HasPrefix(src[i:], dollarTag) {
				b.WriteString(dollarTag)
				i += len(dollarTag) - 1
				dollarTag = ""
			} else {
				b.WriteByte(c)
			}
			continue
		}
		if single {
			b.WriteByte(c)
			if c == '\\' && i+1 < len(src) {
				b.WriteByte(src[i+1])
				i++
				continue
			}
			if c == '\'' {
				if next == '\'' {
					b.WriteByte(next)
					i++
				} else {
					single = false
				}
			}
			continue
		}
		if double {
			b.WriteByte(c)
			if c == '"' {
				if next == '"' {
					b.WriteByte(next)
					i++
				} else {
					double = false
				}
			}
			continue
		}
		if backtick {
			b.WriteByte(c)
			if c == '`' {
				if next == '`' {
					b.WriteByte(next)
					i++
				} else {
					backtick = false
				}
			}
			continue
		}
		if c == '-' && next == '-' {
			lineComment = true
			b.WriteByte(c)
			b.WriteByte(next)
			i++
			continue
		}
		if c == '/' && next == '*' {
			blockComment = true
			b.WriteByte(c)
			b.WriteByte(next)
			i++
			continue
		}
		switch c {
		case '\'':
			single = true
			b.WriteByte(c)
			continue
		case '"':
			double = true
			b.WriteByte(c)
			continue
		case '`':
			backtick = true
			b.WriteByte(c)
			continue
		}
		if c == '$' {
			if j := strings.IndexByte(src[i+1:], '$'); j >= 0 {
				tag := src[i : i+j+2]
				valid := true
				for _, r := range tag[1 : len(tag)-1] {
					if !(r == '_' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z') {
						valid = false
						break
					}
				}
				if valid {
					dollarTag = tag
					b.WriteString(tag)
					i += len(tag) - 1
					continue
				}
			}
		}
		if c == ';' {
			text := strings.TrimSpace(b.String())
			if text != "" {
				out = append(out, text)
			}
			b.Reset()
			continue
		}
		b.WriteByte(c)
	}
	if single || double || backtick || blockComment || dollarTag != "" {
		return nil, fmt.Errorf("unterminated SQL quote/comment")
	}
	if text := strings.TrimSpace(b.String()); text != "" {
		out = append(out, text)
	}
	return out, nil
}
