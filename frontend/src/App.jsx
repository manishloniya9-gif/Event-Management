import React, { useEffect, useMemo, useState } from 'react';

const categories = ['All events', 'Technology', 'Cultural', 'Sports', 'Arts'];
const icons = { Technology: '⌘', Cultural: '♫', Sports: '◉', Arts: '✳' };
const prettyDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const prettyTime = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const inputDateTime = (value) => value ? String(value).replace(' ', 'T').slice(0, 16) : '';
const calendarDate = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const calendarEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function downloadCalendarEvent(event) {
  const start = new Date(event.eventDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Connect//College Events//EN', 'BEGIN:VEVENT', `UID:campusconnect-${event.eventId}@local`, `DTSTAMP:${calendarDate(new Date())}`, `DTSTART:${calendarDate(start)}`, `DTEND:${calendarDate(end)}`, `SUMMARY:${calendarEscape(event.title)}`, `DESCRIPTION:${calendarEscape(event.description)}`, `LOCATION:${calendarEscape(event.venue)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'campus-event'}.ics`; link.click(); URL.revokeObjectURL(url);
}
async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('campusconnect-token');
  const response = await fetch(`http://localhost:4000${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Something went wrong. Please try again.');
  return result;
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [category, setCategory] = useState('All events');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [authNotice, setAuthNotice] = useState('');
  const [registrations, setRegistrations] = useState([]);
  const [view, setView] = useState('events');
  const [actionMessage, setActionMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [organizerEvents, setOrganizerEvents] = useState([]);
  const [editorEvent, setEditorEvent] = useState(null);
  const [attendeeView, setAttendeeView] = useState(null);
  const [feedbackEvent, setFeedbackEvent] = useState(null);

  useEffect(() => {
    apiRequest('/api/events')
      .then((data) => { setEvents(data); setState('ready'); })
      .catch(() => { setError('Could not reach the event service. Check that the backend is running.'); setState('error'); });
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('campusconnect-token')) return;
    apiRequest('/api/me').then(({ user: currentUser }) => setUser(currentUser)).catch(() => localStorage.removeItem('campusconnect-token'));
  }, []);

  useEffect(() => {
    if (!user) { setRegistrations([]); setOrganizerEvents([]); return; }
    if (user.role === 'organizer') {
      apiRequest('/api/organizer/events').then(setOrganizerEvents).catch((requestError) => setActionMessage(requestError.message));
    } else {
      apiRequest('/api/me/registrations').then(setRegistrations).catch((requestError) => setActionMessage(requestError.message));
    }
  }, [user]);

  const refreshEvents = async () => setEvents(await apiRequest('/api/events'));
  const handleAuth = ({ user: signedInUser, token }) => {
    localStorage.setItem('campusconnect-token', token);
    setUser(signedInUser);
    setView(signedInUser.role === 'organizer' ? 'organizer' : 'events');
    setAuthMode(null);
    setAuthNotice('');
    setActionMessage(`Welcome, ${signedInUser.name.split(' ')[0]}!`);
  };
  const signOut = () => {
    localStorage.removeItem('campusconnect-token');
    setUser(null);
    setView('events');
    setActionMessage('You have signed out.');
  };
  const saveProfile = async (name) => {
    const result = await apiRequest('/api/me/profile', { method: 'PUT', body: JSON.stringify({ name }) });
    setUser(result.user);
    setActionMessage(result.message);
  };
  const saveFeedback = async (eventId, values) => {
    setActionBusy(true);
    try {
      const result = await apiRequest(`/api/events/${eventId}/feedback`, { method: 'POST', body: JSON.stringify(values) });
      setRegistrations(await apiRequest('/api/me/registrations'));
      setFeedbackEvent(null);
      setActionMessage(result.message);
    } finally { setActionBusy(false); }
  };
  const registerForEvent = async () => {
    if (!user) { setAuthNotice('Sign in or create a student account to register.'); setAuthMode('login'); return; }
    setActionBusy(true); setActionMessage('');
    try {
      const result = await apiRequest(`/api/events/${selected.id}/register`, { method: 'POST' });
      setActionMessage(result.message);
      await refreshEvents();
      setRegistrations(await apiRequest('/api/me/registrations'));
    } catch (requestError) { setActionMessage(requestError.message); }
    finally { setActionBusy(false); }
  };
  const cancelRegistration = async (eventId) => {
    setActionBusy(true); setActionMessage('');
    try {
      const result = await apiRequest(`/api/events/${eventId}/register`, { method: 'DELETE' });
      setActionMessage(result.message);
      setRegistrations(await apiRequest('/api/me/registrations'));
      await refreshEvents();
    } catch (requestError) { setActionMessage(requestError.message); }
    finally { setActionBusy(false); }
  };
  const refreshOrganizerEvents = async () => setOrganizerEvents(await apiRequest('/api/organizer/events'));
  const saveOrganizerEvent = async (values) => {
    const editing = Boolean(editorEvent?.id);
    setActionBusy(true); setActionMessage('');
    try {
      await apiRequest(editing ? `/api/organizer/events/${editorEvent.id}` : '/api/organizer/events', {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(values)
      });
      setEditorEvent(null);
      await refreshOrganizerEvents();
      await refreshEvents();
      setActionMessage(editing ? 'Event details updated.' : 'Your event is now on the campus calendar.');
    } catch (requestError) { throw requestError; }
    finally { setActionBusy(false); }
  };
  const cancelOrganizerEvent = async (event) => {
    if (!window.confirm(`Cancel “${event.title}”? Students will no longer be able to register. Existing attendee records will be kept.`)) return;
    setActionBusy(true); setActionMessage('');
    try {
      const result = await apiRequest(`/api/organizer/events/${event.id}`, { method: 'DELETE' });
      setActionMessage(result.message);
      await refreshOrganizerEvents();
      await refreshEvents();
    } catch (requestError) { setActionMessage(requestError.message); }
    finally { setActionBusy(false); }
  };
  const completeOrganizerEvent = async (event) => {
    setActionBusy(true); setActionMessage('');
    try {
      const result = await apiRequest(`/api/organizer/events/${event.id}/complete`, { method: 'PATCH' });
      setActionMessage(result.message);
      await refreshOrganizerEvents();
    } catch (requestError) { setActionMessage(requestError.message); }
    finally { setActionBusy(false); }
  };
  const openAttendees = async (event) => {
    setAttendeeView({ event, attendees: null, error: '' });
    try {
      const result = await apiRequest(`/api/organizer/events/${event.id}/attendees`);
      setAttendeeView({ ...result, error: '' });
    } catch (requestError) { setAttendeeView({ event, attendees: [], error: requestError.message }); }
  };
  const toggleCheckIn = async (attendee) => {
    if (!attendeeView?.event?.id) return;
    try {
      const result = await apiRequest(`/api/organizer/events/${attendeeView.event.id}/attendees/${attendee.registrationId}/check-in`, { method: 'PATCH' });
      setAttendeeView((current) => ({ ...current, attendees: current.attendees.map((person) => person.registrationId === attendee.registrationId ? { ...person, attendedAt: result.attendedAt } : person) }));
    } catch (requestError) { setAttendeeView((current) => ({ ...current, error: requestError.message })); }
  };

  const filtered = useMemo(() => events.filter((event) =>
    (category === 'All events' || event.category === category) &&
    `${event.title} ${event.description} ${event.venue}`.toLowerCase().includes(search.toLowerCase())
  ), [events, category, search]);

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={() => setSelected(null)}><span className="brand-mark">C</span><span>campus<span className="brand-light">connect</span></span></a>
      <nav><button className={view === 'events' ? 'nav-active nav-button' : 'nav-button'} onClick={() => setView('events')}>Discover events</button>{user?.role === 'student' && <><button className={view === 'registrations' ? 'nav-active nav-button' : 'nav-button'} onClick={() => setView('registrations')}>My registrations</button><button className={view === 'profile' ? 'nav-active nav-button' : 'nav-button'} onClick={() => setView('profile')}>My profile</button></>}{user?.role === 'organizer' && <button className={view === 'organizer' ? 'nav-active nav-button' : 'nav-button'} onClick={() => setView('organizer')}>Manage events</button>}<a href="#about">About</a></nav>
      {user ? <div className="account-actions"><span className="welcome-name">Hi, {user.name.split(' ')[0]}</span><button className="login-button" onClick={signOut}>Sign out</button></div> : <button className="login-button" onClick={() => { setAuthNotice(''); setAuthMode('login'); }}>Sign in <span>↗</span></button>}
    </header>

    <main id="home">
      {view !== 'organizer' && view !== 'profile' && <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> YOUR CAMPUS, MORE ALIVE</div>
          <h1>Make room for<br /><span>something memorable.</span></h1>
          <p>Discover what’s happening around campus. Find your people, try something new, and be part of it.</p>
          <a className="hero-link" href="#events">Explore upcoming events <span>↓</span></a>
        </div>
        <div className="hero-art" aria-label="Illustration of a college event">
          <div className="sun"/><div className="art-caption">GOOD PEOPLE.<br/>GREAT PLANS.</div>
          <div className="poster"><span>THIS WEEK<br/>ON CAMPUS</span><b>Make it<br/>a moment.</b><i>✳</i></div>
          <div className="plant plant-one">✳</div><div className="plant plant-two">✳</div>
          <div className="art-floor"/><div className="art-person person-one"><i/><b/><em/></div><div className="art-person person-two"><i/><b/><em/></div><div className="art-person person-three"><i/><b/><em/></div>
          <div className="ticket">✦ &nbsp; YOU’RE INVITED</div>
        </div>
        <div className="hero-index"><span>01</span><i/><span>03</span></div>
      </section>}

      {view === 'events' ? <section className="events-section" id="events">
        <div className="section-heading"><div><div className="eyebrow muted">THE CAMPUS CALENDAR</div><h2>Find your <span>next thing.</span></h2></div><div className="heading-note">A little something for<br/>every kind of curious.</div></div>
        <div className="event-controls"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? 'tab selected' : 'tab'} onClick={() => setCategory(item)}>{item === 'All events' ? item : <><span>{icons[item]}</span> {item}</>}</button>)}</div><label className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an event..." /></label></div>
        {state === 'loading' && <div className="message">Getting the campus calendar ready…</div>}
        {state === 'error' && <div className="message error">{error}</div>}
        {state === 'ready' && filtered.length === 0 && <div className="message">No matching events yet. Try another category or search.</div>}
        {state === 'ready' && <div className="event-grid">{filtered.map((event, index) => <article className="event-card" key={event.id}>
          <div className={`card-art card-art-${index % 4}`}><span className="card-category">{event.category}</span><span className="card-symbol">{icons[event.category] || '✦'}</span><span className="card-date"><b>{new Date(event.eventDate).toLocaleDateString('en-IN', { day: '2-digit' })}</b>{new Date(event.eventDate).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span></div>
          <div className="card-content"><div className="card-meta">{prettyDate(event.eventDate)} <span>·</span> {prettyTime(event.eventDate)}</div><h3>{event.title}</h3><p>{event.description}</p><div className="card-bottom"><span>⌖ &nbsp;{event.venue}</span><button onClick={() => setSelected(event)} aria-label={`View ${event.title}`}>↗</button></div></div>
        </article>)}</div>}
        <div className="section-footer"><span>{String(filtered.length).padStart(2, '0')} EVENTS TO EXPLORE</span><span>MADE FOR CAMPUS LIFE <b>✳</b></span></div>
      </section> : view === 'registrations' ? <section className="events-section registrations-page" id="events">
        <div className="section-heading"><div><div className="eyebrow muted">YOUR CAMPUS PLANS</div><h2>My <span>registrations.</span></h2></div><div className="heading-note">Your next campus moments,<br/>all in one place.</div></div>
        {actionMessage && <div className="notice-message">{actionMessage}</div>}
        {!registrations.length ? <div className="empty-registrations"><span>✳</span><h3>Nothing on your calendar yet.</h3><p>Find an event that sounds like you and save your spot.</p><button className="primary-button" onClick={() => setView('events')}>Explore events <span>↗</span></button></div> : <div className="registration-list">{registrations.map((registration, index) => <StudentRegistrationCard key={registration.registrationId} registration={registration} index={index} busy={actionBusy} onCancel={cancelRegistration} onFeedback={setFeedbackEvent} />)}</div>}
      </section> : view === 'profile' ? <section className="events-section profile-page"><div className="section-heading"><div><div className="eyebrow muted">YOUR ACCOUNT</div><h2>Student <span>profile.</span></h2></div></div><ProfileCard user={user} onSave={saveProfile} message={actionMessage} /></section> : <OrganizerDashboard events={organizerEvents} busy={actionBusy} message={actionMessage} onCreate={() => setEditorEvent({ mode: 'create' })} onEdit={(event) => setEditorEvent(event)} onCancel={cancelOrganizerEvent} onComplete={completeOrganizerEvent} onAttendees={openAttendees} />}
      <footer id="about"><a className="brand" href="#home"><span className="brand-mark">C</span><span>campus<span className="brand-light">connect</span></span></a><span>Good things happen when we show up.</span><span>PHASE 4 · CAMPUS EVENTS</span></footer>
    </main>

    {selected && !authMode && <div className="modal-backdrop" onClick={() => { setSelected(null); setActionMessage(''); }}><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => { setSelected(null); setActionMessage(''); }} aria-label="Close">×</button><div className={`modal-art card-art-${events.indexOf(selected) % 4}`}><span className="card-category">{selected.category}</span><span className="card-symbol">{icons[selected.category] || '✦'}</span></div><div className="modal-body"><div className="eyebrow muted">UPCOMING ON CAMPUS</div><h2 id="modal-title">{selected.title}</h2><p>{selected.description}</p><div className="detail-row"><span>DATE & TIME</span><b>{prettyDate(selected.eventDate)} · {prettyTime(selected.eventDate)}</b></div><div className="detail-row"><span>LOCATION</span><b>{selected.venue}</b></div><div className="detail-row"><span>HOSTED BY</span><b>{selected.organizerName}</b></div><div className="detail-row"><span>REGISTER BY</span><b>{prettyDate(selected.registrationDeadline || selected.eventDate)}</b></div><div className="capacity-note">{selected.capacity - (selected.registeredCount || 0)} of {selected.capacity} places remaining</div>{actionMessage && <div className="notice-message modal-notice">{actionMessage}</div>}<button className="phase-button register-button" disabled={actionBusy || registrations.some((item) => item.eventId === selected.id)} onClick={registerForEvent}>{registrations.some((item) => item.eventId === selected.id) ? 'You are registered' : actionBusy ? 'Please wait…' : 'Register for this event'}</button></div></section></div>}
    {authMode && <AuthDialog mode={authMode} initialMessage={authNotice} onClose={() => setAuthMode(null)} onSwitch={(mode) => { setAuthMode(mode); setAuthNotice(''); }} onSuccess={handleAuth} />}
    {editorEvent && <EventEditorDialog event={editorEvent.mode === 'create' ? null : editorEvent} busy={actionBusy} onClose={() => setEditorEvent(null)} onSave={saveOrganizerEvent} />}
    {attendeeView && <AttendeeDialog data={attendeeView} onClose={() => setAttendeeView(null)} onCheckIn={toggleCheckIn} />}
    {feedbackEvent && <FeedbackDialog event={feedbackEvent} busy={actionBusy} onClose={() => setFeedbackEvent(null)} onSave={saveFeedback} />}
  </div>;
}

function StudentRegistrationCard({ registration, index, busy, onCancel, onFeedback }) {
  return <article className="registration-card" key={registration.registrationId}>
    <div className={`registration-date card-art-${index % 4}`}><b>{new Date(registration.eventDate).toLocaleDateString('en-IN', { day: '2-digit' })}</b><span>{new Date(registration.eventDate).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span></div>
    <div className="registration-info"><div className="card-meta">{registration.category} <span>·</span> {prettyTime(registration.eventDate)}</div><h3>{registration.title}</h3><p>⌖ &nbsp;{registration.venue} <span>·</span> Hosted by {registration.organizerName}</p>{registration.feedbackRating && <div className="saved-feedback">Your rating: {'★'.repeat(registration.feedbackRating)}{'☆'.repeat(5 - registration.feedbackRating)}</div>}</div>
    <div className="registration-actions"><button className="calendar-button" onClick={() => downloadCalendarEvent(registration)}>Add to calendar</button>{registration.status === 'completed' && <button className="feedback-button" onClick={() => onFeedback(registration)}>{registration.feedbackRating ? 'Edit feedback' : 'Leave feedback'}</button>}{registration.status === 'upcoming' && <button className="cancel-button" disabled={busy} onClick={() => onCancel(registration.eventId)}>Cancel registration</button>}</div>
  </article>;
}

function ProfileCard({ user, onSave, message }) {
  const [name, setName] = useState(user?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(name); } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <section className="profile-card"><div className="profile-avatar">{user?.name?.slice(0, 1).toUpperCase()}</div><div><div className="eyebrow muted">STUDENT ACCOUNT</div><h3>Your campus profile</h3><p>Keep your name up to date. Your college email is used for event registration.</p></div><form onSubmit={submit}><label>Full name<input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="80" required /></label><label>College email<input value={user?.email || ''} readOnly /></label>{(error || message) && <div className={error ? 'editor-error' : 'notice-message'}>{error || message}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save profile'} <span>↗</span></button></form></section>;
}

function FeedbackDialog({ event, busy, onClose, onSave }) {
  const [rating, setRating] = useState(event.feedbackRating || 0);
  const [comment, setComment] = useState(event.feedbackComment || '');
  const [error, setError] = useState('');
  const submit = async (formEvent) => {
    formEvent.preventDefault();
    if (!rating) { setError('Choose a star rating before saving.'); return; }
    try { setError(''); await onSave(event.eventId, { rating, comment }); }
    catch (requestError) { setError(requestError.message); }
  };
  return <div className="modal-backdrop" onClick={onClose}><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(clickEvent) => clickEvent.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><div className="eyebrow muted">AFTER THE EVENT</div><h2 id="feedback-title">How was {event.title}?</h2><p>Your feedback helps organizers plan better campus events.</p><form onSubmit={submit}><div className="feedback-stars" role="radiogroup" aria-label="Rating from one to five stars">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? '' : 's'}`} className={value <= rating ? 'star selected' : 'star'} onClick={() => setRating(value)}>★</button>)}</div><label>Your comments<textarea value={comment} onChange={(input) => setComment(input.target.value)} maxLength="1000" rows="4" placeholder="What did you enjoy? What could be improved?" /></label><small>{comment.length}/1000</small>{error && <div className="editor-error">{error}</div>}<div className="editor-footer"><button type="button" className="editor-cancel" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save feedback'} <span>↗</span></button></div></form></section></div>;
}

function OrganizerDashboard({ events, busy, message, onCreate, onEdit, onCancel, onComplete, onAttendees }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const activeEvents = events.filter((event) => event.status === 'upcoming');
  const totalAttendees = events.reduce((sum, event) => sum + Number(event.registeredCount || 0), 0);
  const totalCheckedIn = events.reduce((sum, event) => sum + Number(event.checkedInCount || 0), 0);
  const remainingSeats = activeEvents.reduce((sum, event) => sum + Math.max(0, Number(event.capacity) - Number(event.registeredCount || 0)), 0);
  const visibleEvents = events.filter((event) => (statusFilter === 'all' || event.status === statusFilter) && `${event.title} ${event.category} ${event.venue}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="events-section organizer-page" id="events">
    <div className="organizer-heading"><div><div className="eyebrow muted">ORGANIZER WORKSPACE</div><h1>Manage your <span>events.</span></h1><p>Create events, keep details current, and see who’s coming.</p></div><button className="primary-button create-event-button" onClick={onCreate}><span className="create-plus">＋</span>Create an event</button></div>
    {message && <div className="notice-message">{message}</div>}
    <div className="organizer-stats"><article><span>UPCOMING EVENTS</span><b>{activeEvents.length}</b><small>on the campus calendar</small></article><article><span>REGISTRATIONS</span><b>{totalAttendees}</b><small>across your events</small></article><article><span>CHECKED IN</span><b>{totalCheckedIn}</b><small>student attendance</small></article><article><span>OPEN SEATS</span><b>{remainingSeats}</b><small>across upcoming events</small></article></div>
    <div className="organizer-list-heading"><div><div className="eyebrow muted">YOUR CALENDAR</div><h2>Events you host</h2></div><span>{visibleEvents.length} of {events.length} {events.length === 1 ? 'event' : 'events'}</span></div>
    {!events.length ? <div className="empty-registrations organizer-empty"><span>✳</span><h3>Your first event starts here.</h3><p>Create an event to add it to the campus calendar and start taking registrations.</p><button className="primary-button" onClick={onCreate}>Create your first event <span>↗</span></button></div> : <><div className="organizer-filters"><label className="organizer-search">⌕<input aria-label="Search hosted events" placeholder="Search title, venue or category" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter events by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All events</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>{visibleEvents.length ? <div className="organizer-event-list">{visibleEvents.map((event, index) => <article className="organizer-event-card" key={event.id}><div className={`organizer-date card-art-${index % 4}`}><b>{new Date(event.eventDate).toLocaleDateString('en-IN', { day: '2-digit' })}</b><span>{new Date(event.eventDate).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span></div><div className="organizer-event-main"><div className="organizer-event-eyebrow"><span className="organizer-category">{event.category}</span><span className={`event-status ${event.status}`}>{event.status === 'upcoming' ? 'Upcoming' : event.status === 'cancelled' ? 'Cancelled' : 'Completed'}</span></div><h3>{event.title}</h3><p>{prettyTime(event.eventDate)} <span>·</span> {event.venue}</p><div className="attendee-meter"><div><span>{event.registeredCount} registered</span><span>{event.capacity} capacity</span></div><div className="meter-track"><i style={{ width: `${Math.min(100, (Number(event.registeredCount) / event.capacity) * 100)}%` }} /></div></div><div className="event-rating">{event.averageRating ? `★ ${event.averageRating} average rating` : 'No feedback yet'}</div></div><div className="organizer-event-actions"><button className="attendee-button" onClick={() => onAttendees(event)}>Attendees <span>{event.registeredCount}</span></button><div className="organizer-action-row"><button onClick={() => onEdit(event)}>Edit</button><button className="complete-event-button" disabled={busy || event.status !== 'upcoming' || new Date(event.eventDate) > new Date()} title={new Date(event.eventDate) > new Date() ? 'Available after the scheduled event time' : 'Mark this event completed'} onClick={() => onComplete(event)}>Complete</button><button className="cancel-event-button" disabled={busy || event.status !== 'upcoming'} onClick={() => onCancel(event)}>Cancel event</button></div></div></article>)}</div> : <div className="organizer-filter-empty">No events match these filters. Try another search or status.</div>}</>}
  </section>;
}

function EventEditorDialog({ event, busy, onClose, onSave }) {
  const [message, setMessage] = useState('');
  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    const form = new FormData(submitEvent.currentTarget);
    const values = Object.fromEntries(form);
    values.capacity = Number(values.capacity);
    try { await onSave(values); }
    catch (error) { setMessage(error.message); }
  };
  const date = event?.eventDate ? inputDateTime(event.eventDate) : '';
  const deadline = event?.registrationDeadline ? inputDateTime(event.registrationDeadline) : '';
  return <div className="modal-backdrop" onClick={onClose}><section className="event-editor-modal" role="dialog" aria-modal="true" aria-labelledby="event-editor-title" onClick={(clickEvent) => clickEvent.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><div className="eyebrow muted">ORGANIZER WORKSPACE</div><h2 id="event-editor-title">{event ? 'Update event details.' : 'Plan a campus event.'}</h2><p className="editor-intro">{event ? 'Make changes to the event information students see.' : 'Add the key details so students know what to expect.'}</p><form className="event-editor-form" onSubmit={submit}><label className="wide-field">Event title<input name="title" required minLength="3" maxLength="150" defaultValue={event?.title || ''} placeholder="e.g. Spring Tech Showcase" /></label><label>Category<select name="category" required defaultValue={event?.category || 'Technology'}>{categories.slice(1).map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Venue<input name="venue" required minLength="2" maxLength="160" defaultValue={event?.venue || ''} placeholder="Building or location" /></label><label>Event date & time<input type="datetime-local" name="eventDate" required defaultValue={date} /></label><label>Registration deadline<input type="datetime-local" name="registrationDeadline" required defaultValue={deadline} /></label><label>Capacity<input name="capacity" type="number" min="1" max="10000" step="1" required defaultValue={event?.capacity || 100} /></label><label className="wide-field">Description<textarea name="description" required minLength="10" maxLength="5000" rows="4" defaultValue={event?.description || ''} placeholder="What will students experience at your event?" /></label>{message && <div className="editor-error wide-field">{message}</div>}<div className="editor-footer wide-field"><button type="button" className="editor-cancel" onClick={onClose}>Close</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Create event'} <span>↗</span></button></div></form></section></div>;
}

function AttendeeDialog({ data, onClose, onCheckIn }) {
  const [query, setQuery] = useState('');
  const attendees = data.attendees || [];
  const filteredAttendees = attendees.filter((attendee) => `${attendee.name} ${attendee.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const exportCsv = () => {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [['Name', 'College email', 'Registered at', 'Attendance'], ...filteredAttendees.map((person) => [person.name, person.email, prettyDate(person.registeredAt), person.attendedAt ? 'Checked in' : 'Not checked in'])].map((row) => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${data.event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}-attendees.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="modal-backdrop attendee-backdrop" onClick={onClose}><section className="attendee-modal" role="dialog" aria-modal="true" aria-labelledby="attendee-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><div className="eyebrow muted">EVENT CHECK-IN LIST</div><h2 id="attendee-title">{data.event.title}</h2><p className="attendee-subtitle">Registered students and sign-up times.</p>{data.error ? <div className="editor-error">{data.error}</div> : data.attendees === null ? <div className="attendee-loading">Loading attendee list…</div> : !attendees.length ? <div className="attendee-empty"><span>✳</span><b>No registrations yet</b><small>Student registrations will appear here.</small></div> : <><div className="attendee-tools"><label className="organizer-search">⌕<input aria-label="Search attendees" placeholder="Find a student by name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="attendee-export" onClick={exportCsv}>Download CSV</button></div><div className="attendee-count">Showing {filteredAttendees.length} of {attendees.length} registered · {attendees.filter((person) => person.attendedAt).length} checked in</div>{filteredAttendees.length ? <div className="attendee-table-wrap"><table className="attendee-table"><thead><tr><th>STUDENT</th><th>EMAIL</th><th>REGISTERED</th><th>ATTENDANCE</th></tr></thead><tbody>{filteredAttendees.map((attendee) => <tr key={attendee.registrationId}><td><span className="attendee-avatar">{attendee.name.slice(0, 1).toUpperCase()}</span><b>{attendee.name}</b></td><td>{attendee.email}</td><td>{prettyDate(attendee.registeredAt)}</td><td><button className={attendee.attendedAt ? 'checkin-button is-checked' : 'checkin-button'} disabled={data.event.status !== 'upcoming'} onClick={() => onCheckIn(attendee)}>{attendee.attendedAt ? 'Checked in ✓' : 'Mark present'}</button></td></tr>)}</tbody></table></div> : <div className="organizer-filter-empty">No attendees match that search.</div>}</>}<div className="attendee-footer"><button className="editor-cancel" onClick={onClose}>Done</button></div></section></div>;
}

function AuthDialog({ mode, initialMessage, onClose, onSwitch, onSuccess }) {
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMessage(initialMessage), [mode, initialMessage]);
  const isRegister = mode === 'register';
  const submit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setMessage('');
    try { onSuccess(await apiRequest(isRegister ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(values) })); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop auth-backdrop" onClick={onClose}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><div className="eyebrow muted">CAMPUS CONNECT</div><h2 id="auth-title">{isRegister ? 'Join your campus.' : 'Welcome back.'}</h2><p>{isRegister ? 'Create an account to register for or manage campus events.' : 'Sign in to manage your campus events.'}</p><form onSubmit={submit} className="auth-form">{isRegister && <label>Your name<input name="name" type="text" autoComplete="name" required minLength="2" maxLength="80" placeholder="e.g. Asha Patel" /></label>}{isRegister && <label>Account type<select name="role" defaultValue="student"><option value="student">Student — browse and register</option><option value="organizer">Organizer — create and manage events</option></select></label>}<label>College email<input name="email" type="email" autoComplete="email" required placeholder="you@college.edu" /></label><label>Password<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" required placeholder={isRegister ? 'At least 8 characters' : 'Your password'} /></label>{message && <div className="auth-message">{message}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} <span>↗</span></button></form><div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to Campus Connect?'} <button onClick={() => onSwitch(isRegister ? 'login' : 'register')}>{isRegister ? 'Sign in' : 'Create an account'}</button></div></section></div>;
}
