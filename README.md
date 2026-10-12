# Campus Connect — Phase 4

Phase 4 builds on event discovery, student registration, and organizer event management with a simple attendee check-in flow. Organizers can mark registered students present, view the check-in count, and include attendance status in their CSV roster.

## Requirements

- Node.js 18 or newer
- No database server setup is required. SQLite stores the database in a local file.

## Setup

1. From the project root, install the packages:

   ```bash
   npm run install:all
   ```

2. Start the API and frontend together:

   ```bash
   npm run dev
   ```

3. Open **http://localhost:5173**. The API runs at **http://localhost:4000**; its database connection can be checked at **http://localhost:4000/api/health**.

Keep the terminal open while using the site. On first start, the backend creates `backend/database.sqlite` and adds the sample events automatically. If the site says it cannot reach the event service, check that both servers are running.

## Try the organizer flow

1. Sign out of any existing account.
2. Choose **Sign in → Create an account**.
3. Set **Account type** to **Organizer — create and manage events** and complete sign-up.
4. Open **Manage events** to create, edit, or cancel events, search and filter your calendar, and review attendee lists.
5. While an event is upcoming, open its attendee list and mark students present as they arrive. Search the list or download it as a CSV file with attendance status.
6. After the event time, use **Complete** to move it to completed events.

Existing student accounts stay student accounts. Create a separate organizer account with a different email to use the organizer dashboard.

## Phase 1–4 features

- Upcoming event list with sample data
- Category filtering and text search
- Event details with date, time, venue, organizer, and capacity
- Responsive layout for desktop and mobile
- SQLite schema and Express endpoints for listing and viewing events
- Student sign-up and sign-in with hashed passwords
- Event registration with deadline, duplicate, and capacity checks
- Student “My registrations” page with cancellation
- Organizer account type during sign-up
- Organizer dashboard with upcoming-event and attendee totals
- Create, edit, and cancel organizer-owned events
- Attendee list with student names, emails, and registration dates
- Organizer event search and status filters
- Mark past events completed
- Attendee search and CSV roster download
- Attendee check-in with a live count and attendance included in CSV export
- Role and ownership checks on organizer API actions

## Existing setup

If the project is already running, restart both servers from the project root with `npm run dev`. Existing SQLite data is preserved; the backend adds the organizer ownership field when it starts.
