-- Billing Database Schema
-- Uses composite primary key (billing_id, booking_id) to allow multiple bookings per bill
CREATE TABLE IF NOT EXISTS bills (
  billing_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  booking_type VARCHAR(50) NOT NULL,
  booking_id VARCHAR(255) NOT NULL,
  checkout_id VARCHAR(255) NOT NULL,
  transaction_date TIMESTAMP NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_status VARCHAR(50) NOT NULL,
  invoice_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (billing_id, booking_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_transaction_date ON bills(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bills_booking_id ON bills(booking_id);
CREATE INDEX IF NOT EXISTS idx_bills_billing_id ON bills(billing_id);
CREATE INDEX IF NOT EXISTS idx_bills_transaction_status ON bills(transaction_status);
CREATE INDEX IF NOT EXISTS idx_bills_checkout_id ON bills(checkout_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

