# P2PFlow v1.5.36 — Launch Checklist

- [ ] Production database backup নেওয়া হয়েছে
- [ ] `.env`, `.p2pflow/`, `shared/` backup নেওয়া হয়েছে
- [ ] Application version `1.5.36`
- [ ] Database schema `36`
- [ ] `npm run build` pass
- [ ] `npm test` pass
- [ ] Browser/PWA hard refresh করা হয়েছে
- [ ] সংশ্লিষ্ট API credential-এ Release Verification = Fund Transfer Password
- [ ] Saved password browser/API response-এ expose হয় না
- [ ] CRM verification OFF + saved password controlled release test করা হয়েছে
- [ ] CRM verification ON + saved password controlled release test করা হয়েছে
- [ ] Password not saved -> Release-time password field test করা হয়েছে
- [ ] Primary fail -> Secondary verification fallback test করা হয়েছে (যদি configured থাকে)
- [ ] Google Authenticator flow আগের মতো কাজ করছে
- [ ] SMS flow আগের মতো কাজ করছে
- [ ] Payment Split ON/OFF behavior ঠিক আছে
- [ ] Successful Release-এর পরে order/accounting status ঠিক আছে
