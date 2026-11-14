/**
 * My Khata ledger. Money is stored as INTEGER paise (never floats).
 *
 * khata_entries.type:
 *   lena      = person owes me (new debt)         -> balance +
 *   dena      = I owe the person (new debt)       -> balance -
 *   received  = payment received from the person  -> balance -
 *   given     = payment I gave to the person      -> balance +
 * Balance per person = their net debt to me (positive = they owe me, negative = I owe them).
 * Entries are never hard-deleted: delete sets status='deleted' (kept in the timeline, ignored in balances) and every
 * edit/delete/restore is recorded in khata_audit.
 */
export default {
  version: 11,
  name: 'my khata ledger',
  statements: [
    `CREATE TABLE IF NOT EXISTS khata_contacts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       phone TEXT NOT NULL DEFAULT '',
       phone_norm TEXT NOT NULL DEFAULT '',
       android_contact_id TEXT,
       archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_khata_contact_phone ON khata_contacts(phone_norm) WHERE phone_norm <> ''`,
    `CREATE INDEX IF NOT EXISTS idx_khata_contact_name ON khata_contacts(name COLLATE NOCASE)`,
    `CREATE TABLE IF NOT EXISTS khata_entries (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       contact_id INTEGER NOT NULL REFERENCES khata_contacts(id) ON DELETE RESTRICT,
       type TEXT NOT NULL CHECK (type IN ('lena','dena','received','given')),
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       date TEXT NOT NULL,
       note TEXT,
       status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       deleted_at INTEGER
     )`,
    `CREATE INDEX IF NOT EXISTS idx_khata_entries_contact ON khata_entries(contact_id, status, date)`,
    `CREATE INDEX IF NOT EXISTS idx_khata_entries_created ON khata_entries(created_at)`,
    `CREATE TABLE IF NOT EXISTS khata_audit (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       entry_id INTEGER NOT NULL REFERENCES khata_entries(id) ON DELETE CASCADE,
       action TEXT NOT NULL CHECK (action IN ('create','edit','delete','restore')),
       before TEXT,
       at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_khata_audit_entry ON khata_audit(entry_id, at)`,
  ],
};
