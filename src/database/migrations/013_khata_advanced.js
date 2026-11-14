/**
 * My Khata advanced features:
 *  - khata_entries.due_date (optional): enables overdue tracking and aging.
 *  - khata_reminder_log: each reminder opened for a person (SMS / WhatsApp), for "last reminded".
 */
export default {
  version: 13,
  name: 'khata due dates and reminder log',
  statements: [
    `ALTER TABLE khata_entries ADD COLUMN due_date TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_khata_entries_due ON khata_entries(due_date) WHERE due_date IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS khata_reminder_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       contact_id INTEGER NOT NULL REFERENCES khata_contacts(id) ON DELETE CASCADE,
       channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
       amount_paise INTEGER NOT NULL,
       at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_reminder_log_contact ON khata_reminder_log(contact_id, at)`,
  ],
};
