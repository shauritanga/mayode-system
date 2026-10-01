'use client';

import { FormEvent, useEffect, useState } from 'react';
import { governanceApi } from '@/lib/api';

const inputStyle = { padding: 10, borderRadius: 8, border: '1px solid var(--neutral-200)' };
const buttonStyle = { width: 'fit-content', padding: '10px 16px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer' };

export default function GovernancePage() {
  const [votes, setVotes] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState('Yes\nNo');
  const [meetingId, setMeetingId] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [agenda, setAgenda] = useState('');
  const [decisions, setDecisions] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('0');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [votesResponse, meetingsResponse, reportResponse] = await Promise.all([
        governanceApi.votes(), governanceApi.meetings(), governanceApi.report(),
      ]);
      setVotes(votesResponse.data);
      setMeetings(meetingsResponse.data);
      setReport(reportResponse.data);
      setError('');
    } catch {
      setError('Unable to load governance records.');
    }
  };

  useEffect(() => { void load(); }, []);

  const createVote = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const now = new Date();
      await governanceApi.createVote({
        title,
        meetingId: meetingId || undefined,
        opensAt: now.toISOString(),
        closesAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
        options: options.split('\n').map((option) => option.trim()).filter(Boolean),
      });
      setTitle('');
      setMeetingId('');
      await load();
    } catch {
      setError('Unable to create vote. Include at least one option.');
    }
  };

  const createMeeting = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await governanceApi.createMeeting({ meetingDate, agenda, decisions, attendeeCount: Number(attendeeCount) });
      setAgenda('');
      setDecisions('');
      setAttendeeCount('0');
      await load();
    } catch {
      setError('Unable to save meeting record.');
    }
  };

  return <div>
    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800 }}>Governance</h1>
    <p style={{ color: 'var(--neutral-500)', marginBottom: 24 }}>Record meetings, create member votes, and review formal decisions in one place.</p>
    {error && <p style={{ color: 'var(--red-400)' }}>{error}</p>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
      <form onSubmit={createMeeting} className="glass-card" style={{ padding: 20, display: 'grid', gap: 10 }}>
        <strong>Meeting record</strong>
        <input type="date" required value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} style={inputStyle} />
        <input required value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Agenda" style={inputStyle} />
        <textarea required value={decisions} onChange={(event) => setDecisions(event.target.value)} rows={3} placeholder="Decisions made" style={inputStyle} />
        <input type="number" min="0" required value={attendeeCount} onChange={(event) => setAttendeeCount(event.target.value)} placeholder="Attendees" style={inputStyle} />
        <button type="submit" style={buttonStyle}>Save meeting</button>
      </form>

      <form onSubmit={createVote} className="glass-card" style={{ padding: 20, display: 'grid', gap: 10 }}>
        <strong>New member vote</strong>
        <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Vote title" style={inputStyle} />
        <select value={meetingId} onChange={(event) => setMeetingId(event.target.value)} style={inputStyle}>
          <option value="">Not linked to a meeting</option>
          {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{new Date(meeting.meetingDate).toLocaleDateString()} — {meeting.agenda}</option>)}
        </select>
        <textarea value={options} onChange={(event) => setOptions(event.target.value)} rows={3} aria-label="Vote options, one per line" style={inputStyle} />
        <button type="submit" style={buttonStyle}>Create draft</button>
      </form>
    </div>

    <section className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Votes</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {votes.length === 0 && <p style={{ color: 'var(--neutral-500)' }}>No member votes yet.</p>}
        {votes.map((vote) => <div key={vote.id} style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{vote.title}</strong><span>{vote.status}</span></div>
          <p style={{ color: 'var(--neutral-500)' }}>{vote._count?.responses ?? 0} responses</p>
          {vote.status === 'DRAFT' && <button style={buttonStyle} onClick={async () => { await governanceApi.openVote(vote.id); await load(); }}>Open vote &amp; notify farmers</button>}
          {vote.status === 'OPEN' && <button style={buttonStyle} onClick={async () => { await governanceApi.closeVote(vote.id); await load(); }}>Close vote</button>}
        </div>)}
      </div>
    </section>

    <section className="glass-card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Governance report</h2>
      {!report?.meetings?.length && <p style={{ color: 'var(--neutral-500)' }}>No meeting records have been entered.</p>}
      <div style={{ display: 'grid', gap: 14 }}>
        {report?.meetings?.map((meeting: any) => <article key={meeting.id} style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: 12 }}>
          <strong>{new Date(meeting.meetingDate).toLocaleDateString()} — {meeting.agenda}</strong>
          <p style={{ margin: '6px 0', color: 'var(--neutral-600)' }}>{meeting.decisions}</p>
          <small>{meeting.attendeeCount} attendees</small>
          {meeting.votes.map((vote: any) => <div key={vote.id} style={{ marginTop: 10, paddingLeft: 12 }}>
            <strong>{vote.title}</strong> ({vote.status}, {vote._count?.responses ?? 0} responses)
            {vote.results.map((result: any) => <div key={result.optionId} style={{ color: 'var(--neutral-500)', fontSize: 14 }}>{result.label}: {result.votes} ({result.percent.toFixed(1)}%)</div>)}
          </div>)}
        </article>)}
      </div>
    </section>
  </div>;
}
