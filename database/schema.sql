CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(60) NOT NULL,
  event_date DATETIME NOT NULL,
  registration_deadline DATETIME,
  venue VARCHAR(160) NOT NULL,
  capacity INT NOT NULL DEFAULT 100,
  organizer_name VARCHAR(120) NOT NULL,
  organizer_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'cancelled', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'organizer', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attended_at TEXT,
  UNIQUE(user_id, event_id)
);

INSERT OR IGNORE INTO events (id, title, description, category, event_date, venue, capacity, organizer_name)
VALUES (1, 'TechFest 2026', 'A day of student technology showcases, coding challenges, and hands-on demonstrations.', 'Technology', '2026-11-08 10:00:00', 'Main Auditorium', 250, 'Computer Science Club');

INSERT OR IGNORE INTO events (id, title, description, category, event_date, venue, capacity, organizer_name)
VALUES (2, 'Campus Music Evening', 'An informal evening of live performances by student musicians.', 'Cultural', '2026-11-14 17:30:00', 'Open Air Theatre', 180, 'Music Society');

INSERT OR IGNORE INTO events (id, title, description, category, event_date, venue, capacity, organizer_name)
VALUES (3, 'Inter-Department Sports Meet', 'Friendly competitions across departments, with events for beginners and experienced players.', 'Sports', '2026-11-21 09:00:00', 'College Sports Ground', 300, 'Student Council');

INSERT OR IGNORE INTO events (id, title, description, category, event_date, venue, capacity, organizer_name)
VALUES (4, 'Design & Photography Exhibition', 'Explore student photography, posters, and design projects from across campus.', 'Arts', '2026-12-03 11:00:00', 'Library Gallery', 120, 'Arts Association');

