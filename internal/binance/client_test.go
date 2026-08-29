package binance

import (
	"net/url"
	"testing"
)

func TestSignMatchesC2CSAPISample(t *testing.T) {
	values := url.Values{}
	values.Set("adsNo", "10191633467710386176")
	values.Set("timestamp", "1591702613943")
	got := sign(values, "2b5eb11e18796d12d88f13dc27dbbd02c2cc51ff7059765ed9821957d82bb4d9")
	const want = "fcbf9e89c65b441e10281af8a8e82c1d91df4d202a516dbc0e76a8c9f54d4ae5"
	if got != want {
		t.Fatalf("signature mismatch: got %s want %s", got, want)
	}
}
