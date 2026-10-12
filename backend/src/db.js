const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const configuredPath = process.env.DB_PATH || './database.sqlite';
const databasePath = path.resolve(__dirname, '..', configuredPath);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8'));

// Add columns when opening a database created by an earlier project phase.
const eventColumns = db.prepare('PRAGMA table_info(events)').all();
if (!eventColumns.some((column) => column.name === 'registration_deadline')) {
  db.exec('ALTER TABLE events ADD COLUMN registration_deadline DATETIME');
}
if (!eventColumns.some((column) => column.name === 'organizer_id')) {
  db.exec('ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES users(id)');
}
db.exec("UPDATE events SET registration_deadline = datetime(event_date, '-1 day') WHERE registration_deadline IS NULL");
const registrationColumns = db.prepare('PRAGMA table_info(registrations)').all();
if (!registrationColumns.some((column) => column.name === 'attended_at')) {
  db.exec('ALTER TABLE registrations ADD COLUMN attended_at TEXT');
}

module.exports = db;
