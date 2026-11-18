-- DEMO DATA: payments back-dated from December last year to the current month, for the dashboard "Payments received" chart.
-- Everything is tagged DEMO so demo-payments-remove.sql can delete exactly these rows. Nothing here is posted to the ledger.
-- Run once:  psql "$DB" -v ON_ERROR_STOP=1 -v mamcos=<AMCOS id> -v admin=<user id> -f demo-payments.sql
BEGIN;
SELECT set_config('demo.mamcos', :'mamcos', true), set_config('demo.admin', :'admin', true);

DO $$
DECLARE
  m_id   text := current_setting('demo.mamcos');
  adm    text := current_setting('demo.admin');
  farmers text[];
  nf     int;
  start0 date := (date_trunc('year', current_date) - interval '1 month')::date;   -- 1 December last year
  mi     int;
  mstart date;
  mend   date;
  k      int;
  d      date;
  amt    numeric;
  season numeric;
  fid    text;
  cust   text;
  ord    text;
  inv    text;
  due    text;
  cats   text[] := ARRAY['LEVY','CANAL_CLEANING','HARVEST_FEE','MEMBERSHIP_FEE'];
  methods text[] := ARRAY['CASH','MOBILE_MONEY','BANK'];
  n      int := 0;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO farmers FROM farmers WHERE mamcos_id = m_id;
  nf := coalesce(array_length(farmers, 1), 0);
  IF nf = 0 THEN RAISE EXCEPTION 'No farmers in this AMCOS'; END IF;
  IF EXISTS (SELECT 1 FROM member_contributions WHERE mamcos_id = m_id AND reference LIKE 'DEMO-%') THEN
    RAISE EXCEPTION 'Demo payments already loaded; run demo-payments-remove.sql first';
  END IF;

  cust := gen_random_uuid()::text;
  INSERT INTO customers (id, mamcos_id, reference, type, name, phone, is_active, notes, created_at, updated_at)
  VALUES (cust, m_id, 'DEMO-CUST-1', 'BUSINESS', 'DEMO Rice Traders Ltd', '+255700000000', true, 'Demo data', start0, start0);

  FOR mi IN 0..11 LOOP
    mstart := (start0 + (mi || ' month')::interval)::date;
    mend   := least((mstart + interval '1 month' - interval '1 day')::date, current_date - 1);
    CONTINUE WHEN mend < mstart;
    -- Harvest season (Apr-Jul) is heavy for sales; planting (Dec-Feb) for levies and fees.
    season := CASE extract(month FROM mstart)::int
      WHEN 12 THEN 0.8 WHEN 1 THEN 1.0 WHEN 2 THEN 0.9 WHEN 3 THEN 0.6 WHEN 4 THEN 1.2 WHEN 5 THEN 1.9
      WHEN 6 THEN 2.4 WHEN 7 THEN 2.1 WHEN 8 THEN 1.4 WHEN 9 THEN 0.9 WHEN 10 THEN 0.7 ELSE 0.8 END;

    -- member contributions: 4-6 a month
    FOR k IN 1..(4 + mi % 3) LOOP
      n := n + 1;
      d := mstart + ((k * 5 + mi) % greatest(1, (mend - mstart + 1)));
      fid := farmers[1 + (n % nf)];
      amt := round((30000 + (abs(hashtext('c' || n)) % 90000)) / 1000.0) * 1000;
      INSERT INTO member_contributions (id, mamcos_id, farmer_id, amount, contribution_date, payment_method, reference, description, created_at)
      VALUES (gen_random_uuid()::text, m_id, fid, amt, d, methods[1 + n % 3], 'DEMO-C-' || n, 'Demo data', d);
    END LOOP;

    -- dues and fees, each paid in full a few days after it was issued: 4-6 a month
    FOR k IN 1..(4 + (mi + 1) % 3) LOOP
      n := n + 1;
      fid := farmers[1 + (n % nf)];
      d := mstart + ((k * 4 + mi) % greatest(1, (mend - mstart + 1)));
      amt := round((20000 + (abs(hashtext('d' || n)) % 60000)) * (CASE WHEN cats[1 + n % 4] = 'HARVEST_FEE' THEN season ELSE (3.0 - least(season, 2.5)) / 1.5 + 0.5 END) / 1000.0) * 1000;
      due := gen_random_uuid()::text;
      INSERT INTO farmer_dues (id, mamcos_id, farmer_id, category, description, amount, status, issued_on, posted_issue, created_by_id, created_at, updated_at)
      VALUES (due, m_id, fid, cats[1 + n % 4]::"DueCategory", 'DEMO ' || cats[1 + n % 4], amt, 'ACTIVE', d, false, adm, d, d);
      INSERT INTO due_payments (id, mamcos_id, due_id, farmer_id, receipt_no, amount, paid_on, method, note, recorded_by_id, created_at)
      VALUES (gen_random_uuid()::text, m_id, due, fid, 'DEMO-R-' || n, amt, least(d + 2, current_date - 1), methods[1 + n % 3]::"DuePaymentMethod", 'Demo data', adm, d);
    END LOOP;

    -- sales: 1-3 paid orders a month, larger in the selling season
    FOR k IN 1..(1 + (mi % 3)) LOOP
      n := n + 1;
      d := mstart + ((k * 7 + mi) % greatest(1, (mend - mstart + 1)));
      amt := round((400000 + (abs(hashtext('s' || n)) % 500000)) * season / 10000.0) * 10000;
      ord := gen_random_uuid()::text; inv := gen_random_uuid()::text;
      INSERT INTO ops_orders (id, mamcos_id, reference, customer_id, status, payment_status, fulfil_state, subtotal, total, amount_paid, notes, created_by_user_id, created_at, updated_at)
      VALUES (ord, m_id, 'DEMO-ORD-' || n, cust, 'COMPLETED', 'PAID', 'DISPATCHED', amt, amt, amt, 'Demo data', adm, d, d);
      INSERT INTO ops_invoices (id, mamcos_id, invoice_number, order_id, customer_id, customer_name, customer_details, status, subtotal, discount_total, tax_total, total, amount_paid, invoice_date, issued_by_user_id, created_at)
      VALUES (inv, m_id, 'DEMO-INV-' || n, ord, cust, 'DEMO Rice Traders Ltd', '{}'::jsonb, 'PAID', amt, 0, 0, amt, amt, d, adm, d);
      INSERT INTO ops_payments (id, mamcos_id, invoice_id, order_id, amount, method, provider, provider_reference, status, paid_at, source, payer_name, recorded_by_user_id, confirmed_by_user_id, created_at)
      VALUES (gen_random_uuid()::text, m_id, inv, ord, amt, 'MOBILE_MONEY', 'DEMO', 'DEMO-P-' || n, 'CONFIRMED', d + time '10:00', 'MANUAL', 'DEMO Rice Traders Ltd', adm, adm, d);
    END LOOP;
  END LOOP;
END $$;

COMMIT;
