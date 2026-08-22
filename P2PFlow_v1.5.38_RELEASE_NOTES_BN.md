# P2PFlow v1.5.38 - Release Notes

**Application:** 1.5.38  
**Database schema:** 37  
**Migration:** নতুন migration প্রয়োজন নেই

## 1. Release Verification UI ultra-minimal

Release Verification screen থেকে অপ্রয়োজনীয় explanatory cards/text সরানো হয়েছে। এখন current verification-এর জন্য শুধু প্রয়োজনীয় অংশ থাকে:

- verification title;
- required input;
- প্রয়োজন হলে Paste/Resend/Change Verification action;
- input-এর নিচে inline success/warning/error;
- একটিমাত্র **Release Coin** / **Quick Release** button।

Saved Fund Transfer Password, RSA flow, P2PFlow local verification policy, Binance Risk ইত্যাদির দীর্ঘ explanation আর screen ভরে রাখে না। Existing one-click local verification + saved Fund Password + RSA/OAEP-SHA256 release flow অপরিবর্তিত।

Google Authenticator, SMS, Email OTP, Secret Code বা User Password ভুল হলে একই screen-এ error থাকে; modal reload/reopen হয় না।

## 2. Supplied Binance reference screenshots অনুযায়ী P2P UI redesign

নতুন reference ZIP-এর mobile layouts অনুসরণ করে responsive visual layer যোগ হয়েছে:

- P2P Orders: Ongoing/Fulfilled এবং status tabs-এর compact mobile list style;
- P2P Market: compact advertiser rows/cards, filters/chips এবং Buy/Sell action style;
- My Ads: compact account/filter/action layout;
- Post Ad: screenshot-style 3-step editor;
- payment-method / country / terms / preview bottom sheets;
- desktop/tablet/mobile responsive behavior।

এই redesign-এ existing CRM field/action/permission বাদ দেওয়া হয়নি। Pre-redesign Advertisement form-এর existing named fields preserve করা হয়েছে এবং নতুন controls additive।

## 3. Post Normal Ad - 3-step wizard

Create Advertisement এখন:

1. **Set Type & Price**
2. **Set Amount & Method**
3. **Set Conditions**

Create flow-এ final Post-এর আগে **Preview Ad** sheet আছে। Edit flow আগের Save/Publish/Delete functionality ধরে রাখে।

Visible controls-এর মধ্যে আছে:

- Buy / Sell;
- Binance Account;
- Asset / With Fiat;
- Price Type: Fixed / Floating;
- Fixed Price;
- Floating Price Margin;
- live Price Range guide;
- Target Quantity;
- Order Limit;
- Payment Method;
- Payment Time Limit;
- Verification Request;
- Terms Tags;
- Terms;
- Auto-reply;
- Counterparty Conditions;
- Display Regions;
- Status;
- fee preview;
- Preview/Post or Save/Publish/Delete actions।

## 4. Editable Minimum/Maximum Rate input removed

v1.5.35-এর local editable Minimum Rate / Maximum Rate input বর্তমান UI থেকে সরানো হয়েছে। এগুলো Binance API field ছিল না এবং user-এর উদ্দেশ্য ছিল Binance live value দেখা, manual guard set করা নয়।

Editor এখন Binance C2C `getReferencePrice` থেকে live response নেয়। Runtime response-এ explicit usable min/max bound পাওয়া গেলে সেটিই **Price range** হিসেবে দেখানো হয়। Supplied C2C SAPI v7.4 schema explicit allowed min/max field guarantee করে না; তাই bound না এলে supplied Binance mobile reference-এর side-specific presentation অনুযায়ী live reference-based **display guide** দেখানো হয়। Editor open থাকলে প্রায় প্রতি 5 সেকেন্ডে refresh করে।

P2PFlow কোনো fallback range-কে authoritative backend constraint হিসেবে ব্যবহার করে না; final submitted price Binance-এর create/update validation-এর অধীন। UI-তে market context হিসেবে BUY-এর Highest Order Price এবং SELL-এর Lowest Ad Price দেখানোর চেষ্টা করা হয়।

## 5. Fixed / Floating price controls

Binance Ad `priceType` UI-তে visible হয়েছে:

- `1` - Fixed
- `2` - Floating

Floating mode-এ `priceFloatingRatio` edit করা যায় এবং live reference quote ব্যবহার করে current display price calculate হয়। Existing `rateFloatingRatio`/payload compatibility preserved।

## 6. SELL vs BUY payment-method behavior

### SELL Advertisement

SELL create/edit-এ selected Binance API account-এর **saved P2P payment accounts** দেখানো হয়। Sheet-এ available হলে account number/bank/account detail দেখা যায়।

- exact credential-scoped saved payment method;
- exact `payId` isolation;
- maximum 5 selection;
- অন্য Binance account-এর saved payId reuse করা হয় না।

### BUY Advertisement

BUY create/edit-এ saved account number দেখানো হয় না। Binance-supported **generic payment-method types** দেখানো হয়, যেমন available catalog অনুযায়ী bKash/Nagad/Bank Transfer ইত্যাদি।

- generic method selection;
- `payId=0`;
- maximum 5 selection;
- selected generic method key server-side resolve হয়;
- saved SELL account IDs-এর সঙ্গে mix হয় না।

## 7. Verification Request

Post Ad conditions step-এ screenshot-style **Verification Request** toggle যোগ হয়েছে। এটি existing `takerAdditionalKycRequired` behavior-এর UI surface। পুরোনো Terms Tag compatibility রাখা হয়েছে যাতে existing ad data হারায় না।

## 8. No existing Advertisement field removed

Pre-redesign Advertisement editor-এর existing named fields compare করা হয়েছে। Removed field count: **0**। নতুন controls: `additionalKyc`, `priceFloatingRatio`। Legacy `minRate/maxRate` editable inputs intentionally removed because they are superseded by the live display guide and are not Binance payload fields।

## 9. Regression coverage

Automated coverage-এ আছে:

- reference-price adapter + API route;
- no editable min/max-rate input;
- live Price Range UI;
- Fixed/Floating controls;
- 3-step wizard + Preview;
- Verification Request;
- SELL saved payment accounts / BUY generic methods;
- maximum 5 methods;
- multi-account SELL payId isolation;
- BUY generic `payId=0` behavior;
- minimal one-button Release verification;
- permission-authoritative RBAC;
- realtime chat/order/market stability;
- Payment Split/accounting/security/updater existing regressions।

## Live deployment note

Build environment-এ production Binance credential দিয়ে real advertisement Post/Update বা financial Release mutation চালানো হয়নি। Deployment-এর পরে একটি controlled BUY ad draft এবং SELL ad draft দিয়ে payment-method list, live price guide, preview এবং Binance Post validation পরীক্ষা করুন।
