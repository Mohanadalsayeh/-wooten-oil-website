// Read-only reconciliation for agents that import data without detailed run reporting.
export function completedMas90ImportRun(imports, control, batches, recordedRun, timestamp) {
  const customer = imports?.customers, payment = imports?.payments;
  const id = customer?.run_id;
  if (!id || payment?.run_id !== id || control?.active_run_id !== id ||
      control.status !== 'completed' || Number(control.cancel_requested) !== 0) return null;
  if (recordedRun && (recordedRun.status !== 'completed' ||
      Number(recordedRun.customers_failure_count) > 0 || Number(recordedRun.payments_failure_count) > 0)) return null;
  const totals = {};
  for (const [type, metadata] of [['customers', customer], ['payments', payment]]) {
    if (metadata.mode !== 'automatic' || metadata.status !== 'completed' ||
        !Number.isInteger(metadata.batch_count) || metadata.batch_count < 1 ||
        metadata.batch_number !== metadata.batch_count || !timestamp(metadata.at)) return null;
    const rows = batches.filter(row => row.run_id === id && row.import_type === type)
      .sort((a, b) => a.batch_number - b.batch_number);
    if (rows.length !== metadata.batch_count ||
        rows.some((row, i) => Number(row.batch_number) !== i + 1)) return null;
    for (const field of ['success_count', 'failure_count', 'inserted_count', 'duplicate_count']) {
      if (rows.some(row => row[field] == null || !Number.isSafeInteger(Number(row[field])) || Number(row[field]) < 0)) return null;
      totals[type + '_' + field] = rows.reduce((sum, row) => sum + Number(row[field]), 0);
    }
  }
  const dates = [customer.at, payment.at, control.completed_at];
  if (dates.some(date => !timestamp(date))) return null;
  const completedAt = dates.reduce((a, b) => timestamp(a) > timestamp(b) ? a : b);
  const failures = totals.customers_failure_count + totals.payments_failure_count;
  return {
    run_id: id, run_type: 'automatic', request_id: '', status: failures ? 'failed' : 'completed',
    stage: 'completed', progress_percent: 100,
    message: failures ? 'Imports finished with ' + failures + ' failed records. Review the results below.' : 'Customer and payment imports completed; all batches verified.',
    agent_name: 'MAS 90 Office Computer', agent_version: '',
    started_at: '', updated_at: completedAt, completed_at: completedAt,
    ...totals, evidence_source: 'verified_import_batches'
  };
}
