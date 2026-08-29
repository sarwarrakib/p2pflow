package migrate

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSplitSQL(t *testing.T) {
	s := `BEGIN; CREATE TABLE x(a TEXT DEFAULT ';'); -- hi;
INSERT INTO x(a) VALUES('a; b'); /* ; */ COMMIT;`
	v, e := splitSQL(s)
	if e != nil {
		t.Fatal(e)
	}
	if len(v) != 4 {
		t.Fatalf("got %d %#v", len(v), v)
	}
}

func TestAllMigrationFilesParse(t *testing.T) {
	for _, driver := range []string{"postgres", "mysql", "mariadb"} {
		dir := filepath.Join("..", "..", "migrations", driver)
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s: %v", dir, err)
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
				continue
			}
			body, err := os.ReadFile(filepath.Join(dir, entry.Name()))
			if err != nil {
				t.Fatal(err)
			}
			if _, err := splitSQL(string(body)); err != nil {
				t.Fatalf("%s/%s: %v", driver, entry.Name(), err)
			}
		}
	}
}
