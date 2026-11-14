import Native from '../../../modules/reminder-native';
import { khataRepository as K } from '../../database/repositories';
import { ledgerCsv } from './csv';

/** Write the complete ledger (including deleted entries, marked) to a CSV and open the share sheet. */
export async function exportLedgerCsv(deps = {}) {
  const { File, Paths } = deps.fs || require('expo-file-system');
  const Sharing = deps.sharing || require('expo-sharing');
  const rows = await K.allEntriesForExport();
  if (!rows.length) throw new Error('There are no transactions to export yet.');
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  const file = new File(Paths.cache, `my_khata_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.csv`);
  if (file.exists) file.delete();
  file.create();
  await file.write(ledgerCsv(rows));
  if (!(await Sharing.isAvailableAsync())) throw new Error(`Sharing is not available. The file was saved at ${file.uri}`);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'My Khata ledger' });
  return rows.length;
}
void Native;
