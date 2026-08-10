# P2PFlow v1.4.19

## Fresh-install SMTP delivery fix

- Fresh setup-এ `.env`-এ `P2PFLOW_MAIL_DRIVER=smtp` এবং সম্পূর্ণ SMTP credentials থাকলে পুরোনো/default `db.settings.mailDriver=local` আর SMTP-কে shadow করবে না।
- Setup wizard এখন existing `.env` থেকে mail driver, sender, SMTP host/port/user এবং encryption defaults prefill করে; blank SMTP password submit করলে আগে থেকে থাকা `.env` password মুছে যাবে না।
- Hostinger/local PHP mail quota hit করলে P2PFlow আর একের পর এক PHP/sendmail transport hammer করবে না; configured SMTP থাকলে সরাসরি authenticated SMTP fallback-এ যাবে।
- PHP mail binary loop rate-limit response দেখলেই থেমে যায়, যাতে অপ্রয়োজনীয় mail attempts ও quota pressure না বাড়ে।
- Existing Settings > Email Delivery SMTP configuration আগের মতোই supported।
