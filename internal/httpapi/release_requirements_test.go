package httpapi

import (
	"testing"

	"p2pflow/v2/internal/binance"
)

func TestInferConcreteReleaseRequirement(t *testing.T) {
	req := inferReleaseRequirementsFromError(&binance.Error{Status: 400, Code: "-9000", Message: "Your google verification code is missing."})
	if !mapBool(req, "hasSpecificRequirement") {
		t.Fatal("expected concrete verification requirement")
	}
	fields, ok := req["fields"].([]map[string]any)
	if !ok || len(fields) != 1 || asString(fields[0]["name"]) != "googleVerifyCode" {
		t.Fatalf("unexpected requirements: %#v", req)
	}
}

func TestGenericReleaseFailureDoesNotInventMethod(t *testing.T) {
	req := inferReleaseRequirementsFromError(&binance.Error{Status: 400, Code: "100001003", Message: "Verification failed"})
	if mapBool(req, "hasSpecificRequirement") {
		t.Fatalf("generic failure must not invent a challenge: %#v", req)
	}
	if !genericReleaseVerificationRejected(&binance.Error{Status: 400, Code: "100001003", Message: "Verification failed"}) {
		t.Fatal("generic verification rejection was not recognized")
	}
}
