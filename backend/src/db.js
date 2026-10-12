const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
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

// Development-only accounts and registrations make the project ready to demo.
// Never create these shared credentials when running with NODE_ENV=production.
if (process.env.NODE_ENV !== 'production') {
  const createDemoUser = (name, email, password, role) => {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return existing.id;
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, passwordHash, role);
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  };
  const demoStudentId = createDemoUser('Asha Patel', 'student@campus.edu', 'CampusStudent123!', 'student');
  const demoOrganizerId = createDemoUser('Rohan Mehta', 'organizer@campus.edu', 'CampusOrganizer123!', 'organizer');
  let demoEvent = db.prepare('SELECT id FROM events WHERE title = ?').get('Demo Night: Campus Code Lab');
  if (!demoEvent) {
    const result = db.prepare(
      `INSERT INTO events (title, description, category, event_date, registration_deadline, venue, capacity, organizer_name, organizer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('Demo Night: Campus Code Lab', 'A sample organizer event for demonstrating event management, student registration, and attendee check-in.', 'Technology', '2026-11-18 16:00:00', '2026-11-17 23:59:00', 'Innovation Lab', 80, 'Campus Tech Club', demoOrganizerId);
    demoEvent = { id: result.lastInsertRowid };
  }
  let completedDemoEvent = db.prepare('SELECT id FROM events WHERE title = ?').get('Demo Showcase: Student Projects');
  if (!completedDemoEvent) {
    const result = db.prepare(
      `INSERT INTO events (title, description, category, event_date, registration_deadline, venue, capacity, organizer_name, organizer_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`
    ).run('Demo Showcase: Student Projects', 'A completed sample event for demonstrating student feedback and organizer ratings.', 'Arts', '2026-10-01 17:00:00', '2026-09-30 23:59:00', 'Library Gallery', 80, 'Campus Tech Club', demoOrganizerId);
    completedDemoEvent = { id: result.lastInsertRowid };
  }
  db.prepare('INSERT OR IGNORE INTO registrations (user_id, event_id) VALUES (?, ?)').run(demoStudentId, 1);
  db.prepare('INSERT OR IGNORE INTO registrations (user_id, event_id) VALUES (?, ?)').run(demoStudentId, demoEvent.id);
  db.prepare('INSERT OR IGNORE INTO registrations (user_id, event_id) VALUES (?, ?)').run(demoStudentId, completedDemoEvent.id);
  db.prepare('INSERT OR IGNORE INTO event_feedback (user_id, event_id, rating, comment) VALUES (?, ?, 5, ?)')
    .run(demoStudentId, completedDemoEvent.id, 'A friendly, well-organized student showcase.');
}

module.exports = db;
