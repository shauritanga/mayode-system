-- Removes exactly the rows demo-payments.sql created (all tagged DEMO). Safe to run more than once.
BEGIN;
DELETE FROM ops_payments    WHERE provider = 'DEMO' AND provider_reference LIKE 'DEMO-P-%';
DELETE FROM ops_invoices    WHERE invoice_number LIKE 'DEMO-INV-%';
DELETE FROM ops_orders      WHERE reference LIKE 'DEMO-ORD-%';
DELETE FROM customers       WHERE reference LIKE 'DEMO-CUST-%';
DELETE FROM due_payments    WHERE receipt_no LIKE 'DEMO-R-%';
DELETE FROM farmer_dues     WHERE description LIKE 'DEMO %' AND category IN ('LEVY','CANAL_CLEANING','HARVEST_FEE','MEMBERSHIP_FEE');
DELETE FROM member_contributions WHERE reference LIKE 'DEMO-C-%';
COMMIT;
