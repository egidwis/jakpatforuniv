-- Migration: Add payment_channel column to transactions
-- Purpose: Store the actual payment channel DOKU reports in its success webhook
-- (e.g. QRIS, VIRTUAL_ACCOUNT_BCA, CREDIT_CARD, EMONEY_OVO). `payment_method`
-- stays as the gateway marker ('doku'/'simulation'); payment_channel is the
-- specific instrument the customer used, shown on the receipt's "Metode" row.
-- Only populated for payments made after this migration + webhook deploy.

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_channel TEXT DEFAULT NULL;

COMMENT ON COLUMN transactions.payment_channel IS 'Actual DOKU payment channel/instrument from the success webhook (raw code, e.g. QRIS, VIRTUAL_ACCOUNT_BCA, CREDIT_CARD, EMONEY_OVO). Distinct from payment_method (the gateway). NULL for legacy/in-flight transactions.';
