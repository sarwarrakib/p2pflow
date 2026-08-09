# P2PFlow v1.4.10 — P2P Payment Method UI/Data Update

- P2P Profile-এর More statistics screen reference অনুযায়ী পরিষ্কার করা হয়েছে।
- Binance-returned payment method `fieldList` parse করে wallet/account number, bank/sub-bank, payee, remarks/extra fields দেখানো হয়।
- Payment Method edit/add screen এখন selected payment method অনুযায়ী dynamic required fields দেখায়।
- Currency selector এবং payment-method selector bottom-sheet list/search UI যোগ করা হয়েছে।
- Supported fiat currency list এবং valid trade-method catalog Binance read APIs থেকে sync হয়; পুরোনো C2C SAPI endpoint-এর সাথে current agent endpoint fallback রাখা হয়েছে।
- `Add a payment method` fixed bottom action-এর visibility/sticky behavior ঠিক করা হয়েছে।
- Mobile payment subpage/editor খোলা থাকলে main mobile footer navigation hide হয়, যাতে action button-এর সাথে overlap না করে।

## Binance write limitation
Supplied/current documented Binance P2P APIs payment-method configuration read করতে দেয়, কিন্তু payment method configuration create/edit/delete করার documented write endpoint নেই। তাই P2PFlow-এর Add/Edit form বর্তমানে local profile state-এ change সংরক্ষণ করে; Binance account-এর payment method নিজে পরিবর্তন করে না।
