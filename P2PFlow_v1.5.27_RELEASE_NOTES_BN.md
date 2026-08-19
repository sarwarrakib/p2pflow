# P2PFlow v1.5.27 — Receive Charge Fix, Final-Action Split Policy, Multi-number Selection

## Version

- Application: `1.5.27`
- Database schema: `35`
- Package: Unified
- Database migration: প্রয়োজন নেই

## SELL / Receive Payment Split-এ Send Money charge bug fix

Personal ও Merchant Payment Account-এর order split এখন direction-aware। BUY/send split-এ configured **Send Money charge** প্রযোজ্য হবে, কিন্তু SELL/receive split-এ কোনো Send Money/Cash Out charge নেওয়া হবে না।

আগের fallback logic-এর কারণে receive split-এ legacy Send Money fixed charge resolve হতে পারত। ফলে zero-balance receive wallet-এ `Wallet balance is not enough for amount plus transfer charge` error দেখা যেত। এখন Personal/Merchant receive split-এর adjustment kind সরাসরি `none`; incoming principal balance-এ যোগ হবে এবং receive limit consume করবে, কিন্তু outgoing transfer charge apply হবে না।

Agent account-এর existing model অপরিবর্তিত: SELL/receive-এ Received Money commission এবং BUY/send-এ Cash In commission প্রযোজ্য।

## Payment Split requirement setting

Settings > General-এ নতুন policy:

- **Require Payment Split before Mark Paid / Release = ON**: Mark Paid / Release / Quick Release button Payment Split workflow খুলবে এবং split save না হওয়া পর্যন্ত final action হবে না।
- **OFF**: final-action button সরাসরি final action modal খুলবে। Existing split থাকুক বা না থাকুক, Payment Split popup দেখাবে না এবং split mismatch/proof gate final action block করবে না।

Offline order completion-এর accounting workflow আগের মতো split-based থাকে। High-amount approval ও Binance permission/live validation আলাদা security rule হিসেবে অপরিবর্তিত।

## Proof Mandatory / Optional

Settings > General-এ **Payment Split Proof** এখন দুই mode:

- `Mandatory`: split-gated final action-এর আগে প্রতিটি actual Payment Split-এ proof screenshot থাকতে হবে। Transaction ID proof screenshot-এর বিকল্প নয়।
- `Optional`: proof ছাড়া split এবং final action করা যাবে। Transaction ID ও proof দুটোই optional metadata হিসেবে রাখা যায়।

Legacy `Require proof for final action` setting migration-এর সময় নতুন proof mode-এ preserve হয়।

## SELL order Payment Number multi-select

P2P chat-এর Payment Numbers panel এখন:

- number click করলেই আর send হয় না;
- একসাথে একাধিক number select করা যায়;
- `Send Selected` চাপার পরে confirmation দেখায়;
- multiple number পাঠালে Binance chat-এ শুধু clean number list যায় — Label/Serial CRM-এর ভিতরেই থাকে;
- selected state server response পাওয়ার সঙ্গে সঙ্গে UI-তে update হয়; page reload লাগে না;
- order-এর selected account list persisted থাকে।

Payment number list exact order payment method-এর active ও permitted accounts-এ সীমাবদ্ধ।

## Multi-number Payment Split

Order-এ একাধিক payment number selected থাকলে Add Payment Split এবং split-gated final-action modal-এ প্রতিটি selected number আলাদা row হিসেবে দেখায়।

- Number-এর পাশে amount field;
- নিচে ছোট করে Label ও Serial;
- Label/Serial natural order-এ rows সাজানো;
- optional per-row Charge/Commission override;
- common Transaction ID / Note / Proof;
- শুধু amount > 0 row save হয়;
- multi-row save server-side atomic — একটি row fail করলে পুরো batch rollback হয়।

## Payment Split display

Authorized user-এর split list-এ এখন account number primary label হিসেবে দেখা যায়; নিচে Label, Serial ও Payment Method দেখা যায়। Amount ডান পাশে compactভাবে দেখায়। Account access permission না থাকলে sensitive account information এখনও restricted থাকে।

## Regression coverage

`payment-split-final-action-self-test.js` এখন অতিরিক্তভাবে যাচাই করে:

- Receive split configured Send Money fixed charge apply করে না;
- receive wallet zero balance থেকেও incoming principal receive করতে পারে;
- Payment Split gate OFF হলে mismatch/proof issue direct final action block করে না;
- Proof Mandatory missing screenshot detect করে;
- Proof Optional proof block সরায়;
- multi-number selection/confirmation এবং batch split wiring আছে।
