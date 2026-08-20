# P2PFlow v1.5.35 — Release Notes

**Application:** 1.5.35  
**Database schema:** 36  
**Migration:** schema 35 → 36 additive compatibility migration

## 1. Role name আর permission authority নয়

এই release-এর মূল নিয়ম:

```text
Role Name / Template Family = label + default permission template
Runtime Access             = actual checked permissions only
Binance Account Access     = actual exact-account grants only
```

অর্থাৎ `Admin`, `Manager`, `Agent`, `Auditor` নাম নিজে থেকে কোনো page, order, account, approval বা accounting access দেয় না/কেড়ে নেয় না। User/Role-এর `Global Permissions` এবং প্রতিটি Binance credential-এর `Binance Account Permissions`-এ যা checked আছে সেটিই authoritative।

### User Role নির্বাচন করলে কী হবে

Role select করলে সেই Role template-এর permissions user form-এ auto-tick হবে। Enabled Binance account-গুলোর ক্ষেত্রে role-এর applicable permissions-ও defaultভাবে tick হবে। Save করার আগে operator প্রয়োজন অনুযায়ী checkbox পরিবর্তন করতে পারবে। Runtime-এ Role-এর নাম নয়, Save হওয়া permission list-ই ব্যবহার হবে।

### Permission-only করা হয়েছে যেসব flow

- Sidebar/page visibility
- Live Order visibility
- exact Binance credential access
- automatic/manual assignment
- Work/assignment scope
- Payment Account view/use/manage/manage-all
- Payment Split add/edit/complete
- Approval management
- co-agent completion
- Accounting full/scoped view
- order/chat notification audience
- manager-style operational actions

`binance.sync` একই credential-এর জন্য `orders.view` imply করে; অন্য credential-এ কোনো access দেয় না।

## 2. Schema 36 compatibility migration

Schema 36 upgrade-এও Role name authorization source নয়। পুরোনো explicit `allowedP2pCredentialIds` থাকলে সেগুলো preserve করা হয়। আর যেসব legacy broad operator-এর per-account row ছিল না, তাদের existing credential access কেবল actual `credentials.manage` বা `agents.manage` permission থাকলে explicit `binanceCredentialPermissions` rows-এ materialize করা হয়।

অর্থাৎ migration এবং runtime—দুই জায়গাতেই Role name grant তৈরি করে না।

Existing users, Role templates, orders, chats, payment accounts, ledger, accounting এবং credentials delete/replace করা হয় না।

## 3. Order-only assignment আগের মতো থাকবে, role-independent

Global `Payment Account capacity guard for Agent auto assignment` এবং per-user `Use Payment Account calculation for auto assignment` setting বহাল আছে। এগুলো এখন Role name-এর সঙ্গে যুক্ত নয়।

যে linked user-এর প্রয়োজনীয় order permissions, exact account grant এবং routing আছে, সে তার configured accounting/Order-only mode অনুযায়ী assignment candidate হবে।

## 4. Advertisement Minimum Rate / Maximum Rate

Advertisement Create/Edit form-এ এখন দুইটি optional field আছে:

- **Minimum Rate**
- **Maximum Rate**

Blank বা `0` = কোনো bound নেই।

Validation:

- Minimum > Maximum হলে Save block হবে।
- Current Price < Minimum হলে Save block হবে।
- Current Price > Maximum হলে Save block হবে।
- valid range-এর ভেতরে Price থাকলে Save/Update চলবে।

Ad card-এ configured Rate Guard দেখা যাবে।

### Binance API boundary

Minimum/Maximum Rate P2PFlow-এর local safety guard। এগুলো Binance-এর undocumented payload field হিসেবে Create/Update request-এ পাঠানো হয় না। ফলে strict Binance validation-এর সঙ্গে conflict হবে না। Binance sync local Min/Max Rate overwrite করে না।

## 5. UI clarity

User Roles page-এ Role name-কে label/template হিসেবে পরিষ্কার করা হয়েছে। `System Role` wording-এর বদলে `Permission Template Family` দেখানো হয় এবং UI-তে লেখা আছে যে effective permissions-ই runtime authority।

## 6. Regression coverage

এই release-এর dedicated regression checks যাচাই করে:

- backend `userHasPermission()` role name bypass করে না;
- frontend `hasPerm()` role name bypass করে না;
- sidebar/page visibility role-name allowlist ব্যবহার করে না;
- auto-assignment linked user role name দেখে block করে না;
- `accounts.manage_all` permission ছাড়া role name দিয়ে all-account management হয় না;
- schema 36 legacy account access actual permissions/explicit IDs থেকে explicit rows-এ materialize করে;
- differently named role/user কেবল checked permissions অনুযায়ী access পায়;
- Minimum/Maximum Rate UI ও backend validation আছে;
- Min/Max Rate Binance create/update payload-এ leak করে না।

