ALTER TABLE mono
ADD KEY idx_mono_currency_date (currency_code, date(20));

ALTER TABLE privat
ADD KEY idx_privat_currency_date (currency(10), date(20));
