-- Migration Script: Convert bills table to use composite primary key
-- This allows multiple bookings per bill (one row per booking)
-- 
-- IMPORTANT: This migration will:
-- 1. Split existing bills with comma-separated booking_ids into separate rows
-- 2. Update the primary key to composite (billing_id, booking_id)
-- 3. Remove UNIQUE constraint from booking_id
--
-- Run this script on existing databases before deploying the new code

-- Step 1: Create a temporary table to store split billing records
CREATE TABLE IF NOT EXISTS bills_temp AS 
SELECT * FROM bills LIMIT 0;

-- Step 2: For existing bills with comma-separated booking_ids, split them
-- Note: This assumes existing data follows the pattern where billing_id has a suffix
-- and booking_id contains comma-separated values
DO $$
DECLARE
    bill_record RECORD;
    booking_id_array TEXT[];
    booking_id_item TEXT;
    base_billing_id TEXT;
    split_billing_id TEXT;
    invoice_details_json JSONB;
    individual_amount DECIMAL(10, 2);
    total_bookings INTEGER;
BEGIN
    FOR bill_record IN SELECT * FROM bills LOOP
        -- Check if booking_id contains comma (old format)
        IF position(',' in bill_record.booking_id) > 0 THEN
            -- Split booking_ids
            booking_id_array := string_to_array(bill_record.booking_id, ', ');
            
            -- Extract base billing_id (remove any suffix like -HTL-xxx)
            base_billing_id := regexp_replace(bill_record.billing_id, '-HTL-.*$', '');
            base_billing_id := regexp_replace(base_billing_id, '-BK-.*$', '');
            
            -- Parse invoice_details to get individual booking amounts
            invoice_details_json := bill_record.invoice_details;
            
            -- Calculate individual booking amount (divide total by count)
            total_bookings := array_length(booking_id_array, 1);
            individual_amount := bill_record.total_amount / total_bookings;
            
            -- Create one row per booking_id
            FOREACH booking_id_item IN ARRAY booking_id_array LOOP
                INSERT INTO bills_temp (
                    billing_id,
                    user_id,
                    booking_type,
                    booking_id,
                    checkout_id,
                    transaction_date,
                    total_amount,
                    payment_method,
                    transaction_status,
                    invoice_details,
                    created_at,
                    updated_at
                ) VALUES (
                    base_billing_id,
                    bill_record.user_id,
                    bill_record.booking_type,
                    trim(booking_id_item),
                    bill_record.checkout_id,
                    bill_record.transaction_date,
                    individual_amount,
                    bill_record.payment_method,
                    bill_record.transaction_status,
                    bill_record.invoice_details,
                    bill_record.created_at,
                    bill_record.updated_at
                );
            END LOOP;
        ELSE
            -- Already single booking_id, just copy with base billing_id
            base_billing_id := regexp_replace(bill_record.billing_id, '-HTL-.*$', '');
            base_billing_id := regexp_replace(base_billing_id, '-BK-.*$', '');
            
            INSERT INTO bills_temp SELECT * FROM bills WHERE billing_id = bill_record.billing_id AND booking_id = bill_record.booking_id;
            -- Update billing_id to base if needed
            IF base_billing_id != bill_record.billing_id THEN
                UPDATE bills_temp SET billing_id = base_billing_id 
                WHERE billing_id = bill_record.billing_id AND booking_id = bill_record.booking_id;
            END IF;
        END IF;
    END LOOP;
END $$;

-- Step 3: Drop existing constraints and indexes
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_pkey;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_booking_id_key;
DROP INDEX IF EXISTS idx_bills_booking_id;

-- Step 4: Drop old table and rename temp table
DROP TABLE bills;
ALTER TABLE bills_temp RENAME TO bills;

-- Step 5: Add composite primary key
ALTER TABLE bills ADD PRIMARY KEY (billing_id, booking_id);

-- Step 6: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_transaction_date ON bills(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bills_booking_id ON bills(booking_id);
CREATE INDEX IF NOT EXISTS idx_bills_billing_id ON bills(billing_id);
CREATE INDEX IF NOT EXISTS idx_bills_transaction_status ON bills(transaction_status);
CREATE INDEX IF NOT EXISTS idx_bills_checkout_id ON bills(checkout_id);

-- Step 7: Recreate trigger
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verification query
SELECT 
    billing_id,
    COUNT(*) as booking_count,
    STRING_AGG(booking_id, ', ') as booking_ids,
    SUM(total_amount) as total_amount
FROM bills
GROUP BY billing_id
HAVING COUNT(*) > 1
ORDER BY billing_id
LIMIT 10;

