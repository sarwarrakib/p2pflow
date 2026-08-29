package httpapi

import "testing"

func TestNormalizePublicUsername(t *testing.T) {
	cases := map[string]string{
		" Rakib.P2P ": "rakib.p2p",
		"A B/C":       "abc",
		"__User__":    "user",
	}
	for in, want := range cases {
		if got := normalizePublicUsername(in); got != want {
			t.Fatalf("normalizePublicUsername(%q)=%q want %q", in, got, want)
		}
	}
}

func TestValidPublicUsername(t *testing.T) {
	for _, v := range []string{"rakib", "rakib.p2p", "u_123", "a-b"} {
		if !validPublicUsername(v) {
			t.Fatalf("expected valid username: %q", v)
		}
	}
	for _, v := range []string{"ab", "-rakib", "rakib-", "Rakib", "rakib p2p"} {
		if validPublicUsername(v) {
			t.Fatalf("expected invalid username: %q", v)
		}
	}
}
