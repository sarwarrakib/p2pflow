package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type candidate struct {
	path string
	mod  time.Time
}

func main() {
	if len(os.Args) < 2 || os.Args[1] != "activate" {
		fmt.Fprintln(os.Stderr, "usage: p2pflow-updater activate --release-dir DIR --version X.Y.Z --current-link PATH")
		os.Exit(2)
	}
	fs := flag.NewFlagSet("activate", flag.ExitOnError)
	releaseDir := fs.String("release-dir", "./data/system-updates", "system update working directory")
	version := fs.String("version", "", "verified staged release version")
	currentLink := fs.String("current-link", "./data/system-updates/current", "atomic current-release symlink")
	_ = fs.Parse(os.Args[2:])
	if strings.TrimSpace(*version) == "" || strings.ContainsAny(*version, `/\\`) {
		fatal("invalid --version")
	}
	base, err := filepath.Abs(*releaseDir)
	if err != nil {
		fatal(err.Error())
	}
	releases := filepath.Join(base, "releases")
	matches, err := filepath.Glob(filepath.Join(releases, "v"+*version+"-*"))
	if err != nil || len(matches) == 0 {
		fatal("verified staged release not found")
	}
	var candidates []candidate
	for _, p := range matches {
		st, err := os.Stat(p)
		if err != nil || !st.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(p, "VERSION"))
		if err != nil || strings.TrimSpace(string(b)) != *version {
			continue
		}
		if _, err := os.Stat(filepath.Join(p, "web", "index.html")); err != nil {
			continue
		}
		if _, err := os.Stat(filepath.Join(p, "migrations")); err != nil {
			continue
		}
		candidates = append(candidates, candidate{path: p, mod: st.ModTime()})
	}
	if len(candidates) == 0 {
		fatal("no valid staged release directory found")
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].mod.After(candidates[j].mod) })
	target, err := filepath.Abs(candidates[0].path)
	if err != nil {
		fatal(err.Error())
	}
	link, err := filepath.Abs(*currentLink)
	if err != nil {
		fatal(err.Error())
	}
	if err := os.MkdirAll(filepath.Dir(link), 0750); err != nil {
		fatal(err.Error())
	}
	if info, err := os.Lstat(link); err == nil && info.Mode()&os.ModeSymlink == 0 {
		fatal("current-link exists and is not a symlink; refusing to replace it")
	} else if err != nil && !os.IsNotExist(err) {
		fatal(err.Error())
	}
	tmp := filepath.Join(filepath.Dir(link), fmt.Sprintf(".%s.next-%d", filepath.Base(link), os.Getpid()))
	_ = os.Remove(tmp)
	if err := os.Symlink(target, tmp); err != nil {
		fatal(err.Error())
	}
	if err := os.Rename(tmp, link); err != nil {
		_ = os.Remove(tmp)
		fatal(err.Error())
	}
	fmt.Printf("activated release pointer: %s -> %s\n", link, target)
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "p2pflow-updater:", msg)
	os.Exit(1)
}
