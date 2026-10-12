const express = require('express');
const cors = require('cors');
const { createHmac, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const db = require('./db');

const app = express();
const scrypt = promisify(scryptCallback);
const tokenSecret = process.env.JWT_SECRET || 'college-event-local-development-secret';
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });
const createToken = (userId) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 })).toString('base64url');
  const content = `${header}.${payload}`;
  return `${content}.${createHmac('sha256', tokenSecret).update(content).digest('base64url')}`;
};
const verifyToken = (token) => {
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) throw new Error('Invalid session.');
  const content = `${header}.${payload}`;
  const expected = createHmac('sha256', tokenSecret).update(content).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid session.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!claims.userId || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Expired session.');
  return claims;
};
const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
};
const passwordMatches = async (password, storedHash) => {
  const [salt, savedHex] = storedHash.split(':');
  if (!salt || !savedHex || !/^[a-f0-9]+$/i.test(savedHex)) return false;
  const saved = Buffer.from(savedHex, 'hex');
  const actual = await scrypt(password, salt, saved.length);
  return saved.length === actual.length && timingSafeEqual(saved, actual);
};
const authRequired = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = verifyToken(token);
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
};
const organizerRequired = (req, res, next) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ message: 'Organizer access is required for this action.' });
  next();
};
const eventCategories = ['Technology', 'Cultural', 'Sports', 'Arts'];
const eventInput = (body) => {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || '');
  const eventDate = String(body.eventDate || '').trim().replace('T', ' ');
  const registrationDeadline = String(body.registrationDeadline || '').trim().replace('T', ' ');
  const venue = String(body.venue || '').trim();
  const capacity = Number(body.capacity);
  if (title.length < 3 || title.length > 150) return { error: 'Event title must be between 3 and 150 characters.' };
  if (description.length < 10 || description.length > 5000) return { error: 'Description must be between 10 and 5,000 characters.' };
  if (!eventCategories.includes(category)) return { error: 'Choose a valid event category.' };
  if (venue.length < 2 || venue.length > 160) return { error: 'Venue must be between 2 and 160 characters.' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) return { error: 'Capacity must be a whole number between 1 and 10,000.' };
  const eventTimestamp = new Date(eventDate.replace(' ', 'T')).getTime();
  const deadlineTimestamp = new Date(registrationDeadline.replace(' ', 'T')).getTime();
  if (!Number.isFinite(eventTimestamp) || !Number.isFinite(deadlineTimestamp)) return { error: 'Enter a valid event date and registration deadline.' };
  if (eventTimestamp <= Date.now()) return { error: 'Event date must be in the future.' };
  if (deadlineTimestamp <= Date.now() || deadlineTimestamp >= eventTimestamp) return { error: 'Registration deadline must be in the future and before the event.' };
  return { value: { title, description, category, eventDate, registrationDeadline, venue, capacity } };
};

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'connected', databaseType: 'SQLite' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Cannot open the local SQLite database.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'organizer' ? 'organizer' : 'student';
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  try {
    const passwordHash = await hashPassword(password);
    const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, passwordHash, role);
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = createToken(user.id);
    res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('Could not register student:', error.message);
    res.status(500).json({ message: 'Could not create your account right now.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, name, email, role, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !(await passwordMatches(password, user.password_hash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  const token = createToken(user.id);
  res.json({ user: publicUser(user), token });
});

app.get('/api/me', authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/organizer/events', authRequired, organizerRequired, (req, res) => {
  const events = db.prepare(
    `SELECT e.id, e.title, e.description, e.category, e.event_date AS eventDate,
            e.registration_deadline AS registrationDeadline, e.venue, e.capacity,
            e.organizer_name AS organizerName, e.status,
            COUNT(r.id) AS registeredCount
     FROM events e LEFT JOIN registrations r ON r.event_id = e.id
     WHERE e.organizer_id = ? GROUP BY e.id ORDER BY e.event_date ASC`
  ).all(req.user.id);
  res.json(events);
});

app.post('/api/organizer/events', authRequired, organizerRequired, (req, res) => {
  const parsed = eventInput(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const event = parsed.value;
  try {
    const result = db.prepare(
      `INSERT INTO events
       (title, description, category, event_date, registration_deadline, venue, capacity, organizer_name, organizer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(event.title, event.description, event.category, event.eventDate, event.registrationDeadline,
      event.venue, event.capacity, req.user.name, req.user.id);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Event created.' });
  } catch (error) {
    console.error('Could not create event:', error.message);
    res.status(500).json({ message: 'Could not create this event right now.' });
  }
});

app.put('/api/organizer/events/:id', authRequired, organizerRequired, (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND organizer_id = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ message: 'Event not found in your organizer account.' });
  const parsed = eventInput(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const values = parsed.value;
  const registrations = db.prepare('SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?').get(event.id).total;
  if (values.capacity < registrations) return res.status(400).json({ message: `Capacity cannot be below the current ${registrations} registrations.` });
  try {
    db.prepare(
      `UPDATE events SET title = ?, description = ?, category = ?, event_date = ?,
       registration_deadline = ?, venue = ?, capacity = ?, status = 'upcoming'
       WHERE id = ? AND organizer_id = ?`
    ).run(values.title, values.description, values.category, values.eventDate, values.registrationDeadline,
      values.venue, values.capacity, event.id, req.user.id);
    res.json({ message: 'Event updated.' });
  } catch (error) {
    console.error('Could not update event:', error.message);
    res.status(500).json({ message: 'Could not update this event right now.' });
  }
});

app.delete('/api/organizer/events/:id', authRequired, organizerRequired, (req, res) => {
  const result = db.prepare("UPDATE events SET status = 'cancelled' WHERE id = ? AND organizer_id = ? AND status = 'upcoming'")
    .run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ message: 'Upcoming event not found in your organizer account.' });
  res.json({ message: 'Event cancelled. Existing attendee records have been kept.' });
});

app.patch('/api/organizer/events/:id/complete', authRequired, organizerRequired, (req, res) => {
  const event = db.prepare('SELECT id, event_date AS eventDate, status FROM events WHERE id = ? AND organizer_id = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ message: 'Event not found in your organizer account.' });
  if (event.status !== 'upcoming') return res.status(400).json({ message: 'Only upcoming events can be marked completed.' });
  if (new Date(event.eventDate) > new Date()) return res.status(400).json({ message: 'You can mark an event completed after its scheduled time.' });
  db.prepare("UPDATE events SET status = 'completed' WHERE id = ? AND organizer_id = ?").run(event.id, req.user.id);
  res.json({ message: 'Event marked as completed.' });
});

app.get('/api/organizer/events/:id/attendees', authRequired, organizerRequired, (req, res) => {
  const event = db.prepare('SELECT id, title, status FROM events WHERE id = ? AND organizer_id = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ message: 'Event not found in your organizer account.' });
  const attendees = db.prepare(
    `SELECT u.id, r.id AS registrationId, u.name, u.email,
            r.registered_at AS registeredAt, r.attended_at AS attendedAt
     FROM registrations r JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ? ORDER BY r.registered_at ASC`
  ).all(event.id);
  res.json({ event, attendees });
});

app.patch('/api/organizer/events/:id/attendees/:registrationId/check-in', authRequired, organizerRequired, (req, res) => {
  const registration = db.prepare(
    `SELECT r.id, r.attended_at AS attendedAt
     FROM registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND e.id = ? AND e.organizer_id = ? AND e.status = 'upcoming'`
  ).get(req.params.registrationId, req.params.id, req.user.id);
  if (!registration) return res.status(404).json({ message: 'Attendee not found for an active event you manage.' });
  const attendedAt = registration.attendedAt ? null : new Date().toISOString();
  db.prepare('UPDATE registrations SET attended_at = ? WHERE id = ?').run(attendedAt, registration.id);
  res.json({ attendedAt, message: attendedAt ? 'Student checked in.' : 'Check-in removed.' });
});

app.get('/api/events', (req, res) => {
  try {
    const events = db.prepare(
      `SELECT e.id, e.title, e.description, e.category, e.event_date AS eventDate,
              e.registration_deadline AS registrationDeadline, e.venue, e.capacity,
              e.organizer_name AS organizerName, e.status,
              COUNT(r.id) AS registeredCount
       FROM events e LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.status = 'upcoming' GROUP BY e.id ORDER BY e.event_date ASC`
    ).all();
    res.json(events);
  } catch (error) {
    console.error('Unable to load events:', error.message);
    res.status(500).json({ message: 'Could not load events from the local database.' });
  }
});

app.get('/api/events/:id', (req, res) => {
  const event = db.prepare(
    `SELECT id, title, description, category, event_date AS eventDate,
            registration_deadline AS registrationDeadline, venue, capacity,
            organizer_name AS organizerName, status
     FROM events WHERE id = ?`
  ).get(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  res.json(event);
});

app.post('/api/events/:id/register', authRequired, (req, res) => {
  const event = db.prepare('SELECT id, event_date, registration_deadline, capacity, status FROM events WHERE id = ?').get(req.params.id);
  if (!event || event.status !== 'upcoming') return res.status(404).json({ message: 'This event is not available for registration.' });
  const deadline = new Date(String(event.registration_deadline || event.event_date).replace(' ', 'T'));
  const start = new Date(String(event.event_date).replace(' ', 'T'));
  if (Date.now() >= deadline.getTime() || Date.now() >= start.getTime()) {
    return res.status(400).json({ message: 'Registration for this event has closed.' });
  }
  try {
    const register = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?').get(req.user.id, event.id);
      if (existing) return { error: 'You are already registered for this event.' };
      const count = db.prepare('SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?').get(event.id).total;
      if (count >= event.capacity) return { error: 'This event has reached its capacity.' };
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(req.user.id, event.id);
      return { success: true };
    })();
    if (register.error) return res.status(409).json({ message: register.error });
    res.status(201).json({ message: 'You are registered for this event.' });
  } catch (error) {
    console.error('Could not register student for event:', error.message);
    res.status(500).json({ message: 'Could not complete registration right now.' });
  }
});

app.delete('/api/events/:id/register', authRequired, (req, res) => {
  const result = db.prepare('DELETE FROM registrations WHERE user_id = ? AND event_id = ?').run(req.user.id, req.params.id);
  if (!result.changes) return res.status(404).json({ message: 'You do not have a registration for this event.' });
  res.json({ message: 'Your registration was cancelled.' });
});

app.get('/api/me/registrations', authRequired, (_req, res) => {
  const registrations = db.prepare(
    `SELECT r.id AS registrationId, r.registered_at AS registeredAt,
            e.id AS eventId, e.title, e.description, e.category,
            e.event_date AS eventDate, e.registration_deadline AS registrationDeadline,
            e.venue, e.organizer_name AS organizerName
     FROM registrations r JOIN events e ON e.id = r.event_id
     WHERE r.user_id = ? ORDER BY e.event_date ASC`
  ).all(_req.user.id);
  res.json(registrations);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Event API listening at http://localhost:${port}`));
