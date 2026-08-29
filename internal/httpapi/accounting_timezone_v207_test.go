package httpapi

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestAccountingTimezoneV207BangladeshDailyBoundary(t *testing.T) {
	settings := map[string]any{"timezoneOffsetMinutes": 360}
	req := httptest.NewRequest("GET", "/api/accounting?period=daily", nil)
	now := time.Date(2026, 8, 28, 18, 30, 0, 0, time.UTC) // 2026-08-29 00:30 at UTC+06.
	rg := accountingRangeAt(req, settings, now)
	if rg.BusinessDate != "2026-08-29" || rg.StartDate != "2026-08-29" || rg.EndDateExclusive != "2026-08-30" {
		t.Fatalf("unexpected business range: %#v", rg)
	}
	wantStart := time.Date(2026, 8, 28, 18, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, 8, 29, 18, 0, 0, 0, time.UTC)
	if !rg.Start.Equal(wantStart) || !rg.End.Equal(wantEnd) {
		t.Fatalf("UTC bounds=%s..%s want=%s..%s", rg.Start, rg.End, wantStart, wantEnd)
	}
	if got := accountingBusinessDateAt(wantStart.Add(-time.Nanosecond), 360); got != "2026-08-28" {
		t.Fatalf("pre-boundary date=%s", got)
	}
	if got := accountingBusinessDateAt(wantStart, 360); got != "2026-08-29" {
		t.Fatalf("boundary date=%s", got)
	}
}

func TestAccountingTimezoneV207NegativeOffsetBoundary(t *testing.T) {
	settings := map[string]any{"timezoneOffsetMinutes": -300}
	req := httptest.NewRequest("GET", "/api/accounting?period=daily", nil)
	now := time.Date(2026, 8, 29, 4, 30, 0, 0, time.UTC) // 2026-08-28 23:30 at UTC-05.
	rg := accountingRangeAt(req, settings, now)
	if rg.BusinessDate != "2026-08-28" || rg.StartDate != "2026-08-28" || rg.EndDateExclusive != "2026-08-29" {
		t.Fatalf("unexpected negative-offset range: %#v", rg)
	}
	wantStart := time.Date(2026, 8, 28, 5, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2026, 8, 29, 5, 0, 0, 0, time.UTC)
	if !rg.Start.Equal(wantStart) || !rg.End.Equal(wantEnd) {
		t.Fatalf("UTC bounds=%s..%s want=%s..%s", rg.Start, rg.End, wantStart, wantEnd)
	}
}

func TestAccountingTimezoneV207CustomInclusiveEndDate(t *testing.T) {
	settings := map[string]any{"timezoneOffsetMinutes": 330}
	req := httptest.NewRequest("GET", "/api/accounting?period=custom&start=2026-08-01&end=2026-08-03", nil)
	rg := accountingRangeAt(req, settings, time.Date(2026, 8, 29, 0, 0, 0, 0, time.UTC))
	if rg.StartDate != "2026-08-01" || rg.EndDateExclusive != "2026-08-04" || rg.Label != "2026-08-01 → 2026-08-03" {
		t.Fatalf("unexpected custom range: %#v", rg)
	}
	if got := rg.Start.UTC().Format(time.RFC3339); got != "2026-07-31T18:30:00Z" {
		t.Fatalf("start=%s", got)
	}
	if got := rg.End.UTC().Format(time.RFC3339); got != "2026-08-03T18:30:00Z" {
		t.Fatalf("end=%s", got)
	}
}
