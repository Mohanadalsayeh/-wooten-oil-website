/* Ver1097 — statement-specific MAS 90 payment selection.
   Use posting date when MAS 90 supplies it; otherwise payment date.
   Payment imports are date-level records and cannot establish hour/minute cutoffs.
   Preview and Generate call the same server-side selector and saved range. */
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export function validatePaymentPeriod(period){
  if(!period||!validDay(period.from)||!validDay(period.to)||period.from>period.to){
    throw Error('Choose valid From and To dates for the statement period.');
  }
  return {from:period.from,to:period.to};
}

// The MAS 90 importer normally stores YYYY-MM-DD; also permit ISO date-time
// values. Do not guess at locale-ambiguous or invalid dates.
const effectiveDateSQL=`substr(COALESCE(NULLIF(trim(posting_date),''),NULLIF(trim(payment_date),''),''),1,10)`;

export async function loadStatementPeriodPayments(db,account,paymentCount,period){
  const {from,to}=validatePaymentPeriod(period);
  if(!/^\d{7,20}$/.test(String(account||'')))throw Error('Invalid statement customer number.');
  const max=Math.max(0,Math.min(20,Number.parseInt(paymentCount,10)||0));
  if(!max)return [];
  const response=await db.prepare(`
    SELECT payment_date,reference AS check_number,source_invoice_no AS invoice_number,
      amount,posting_date,deposit_date
    FROM customer_payments
    WHERE account_number=? AND ${effectiveDateSQL}>=? AND ${effectiveDateSQL}<=?
    ORDER BY ${effectiveDateSQL} DESC,id DESC
    LIMIT ?
  `).bind(account,from,to,max).all();
  return response?.results||[];
}
