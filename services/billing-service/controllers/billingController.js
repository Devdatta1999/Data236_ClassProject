/**
 * Billing Controller
 * Note: Payment processing and checkout are handled via Kafka (payment-events and checkout-events topics)
 * Only non-high-traffic operations remain as HTTP endpoints
 */

const { getPostgresPool } = require('../../../shared/config/database');
const { NotFoundError, asyncHandler } = require('../../../shared/utils/errors');
const logger = require('../../../shared/utils/logger');

/**
 * Get billing details
 */
const getBilling = asyncHandler(async (req, res) => {
  const { billingId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE billing_id = $1',
    [billingId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Billing record');
  }

  res.json({
    success: true,
    data: { bill: result.rows[0] }
  });
});

/**
 * Get user billing history
 */
const getUserBillingHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE user_id = $1 ORDER BY transaction_date DESC',
    [userId]
  );

  res.json({
    success: true,
    count: result.rows.length,
    data: { bills: result.rows }
  });
});

/**
 * Search bills (Admin only)
 */
const searchBills = asyncHandler(async (req, res) => {
  const { startDate, endDate, month, year, userId, status } = req.query;

  let query = 'SELECT * FROM bills WHERE 1=1';
  const params = [];
  let paramCount = 0;

  if (startDate && endDate) {
    paramCount++;
    query += ` AND transaction_date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
    query += ` AND transaction_date <= $${paramCount}`;
    params.push(endDate);
  } else if (month && year) {
    paramCount++;
    query += ` AND EXTRACT(MONTH FROM transaction_date) = $${paramCount}`;
    params.push(parseInt(month));
    paramCount++;
    query += ` AND EXTRACT(YEAR FROM transaction_date) = $${paramCount}`;
    params.push(parseInt(year));
  }

  if (userId) {
    paramCount++;
    query += ` AND user_id = $${paramCount}`;
    params.push(userId);
  }

  if (status) {
    paramCount++;
    query += ` AND transaction_status = $${paramCount}`;
    params.push(status);
  }

  query += ' ORDER BY transaction_date DESC';

  const pool = getPostgresPool();
  const result = await pool.query(query, params);

  res.json({
    success: true,
    count: result.rows.length,
    data: { bills: result.rows }
  });
});

/**
 * Get invoice
 */
const getInvoice = asyncHandler(async (req, res) => {
  const { billingId } = req.params;

  const pool = getPostgresPool();
  const result = await pool.query(
    'SELECT * FROM bills WHERE billing_id = $1',
    [billingId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Billing record');
  }

  const bill = result.rows[0];

  // Format invoice
  const invoice = {
    billingId: bill.billing_id,
    invoiceNumber: `INV-${bill.billing_id}`,
    transactionDate: bill.transaction_date,
    user: {
      userId: bill.user_id
    },
    booking: {
      bookingId: bill.booking_id,
      type: bill.booking_type
    },
    payment: {
      method: bill.payment_method,
      amount: bill.total_amount,
      status: bill.transaction_status
    },
    details: bill.invoice_details
  };

  res.json({
    success: true,
    data: { invoice }
  });
});

module.exports = {
  getBilling,
  getUserBillingHistory,
  searchBills,
  getInvoice
};

