/**
 * JevSentinel.jsx — a page for CXM-Tool.
 *
 * Copy to `src/pages/JevSentinel.jsx` in the CXM-Tool repo, add a sidebar entry
 * and a route, and it works. It uses CXM-Tool's own design tokens (the CSS
 * custom properties in `src/styles/design-system.css`) and its `.glass-card`,
 * `.badge` and `.btn` classes, so it looks like a page of that app rather than
 * something bolted on. Full steps in docs/INTEGRATION.md.
 *
 * Dependencies: react, lucide-react, recharts — all three already in
 * CXM-Tool's package.json. Nothing new to install.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Gauge, Loader2,
  RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = import.meta.env?.VITE_JEV_API ?? '/api/jev';

/* --------------------------------------------------------------- formatting */

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const usd = (n) =>
  n == null ? '—' : n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(6)}` : n < 1 ? `$${n.toFixed(4)}` : `$${Math.round(n).toLocaleString()}`;

const BAND_CLASS = { P1: 'badge-danger', P2: 'badge-warning', P3: 'badge-info', P4: 'badge-info' };
const GRADE_CLASS = { Critical: 'badge-danger', Poor: 'badge-danger', Neutral: 'badge-warning', Good: 'badge-success', Excellent: 'badge-success' };

/**
 * The confidence bar, with the threshold drawn on it.
 *
 * Worth the pixels: the whole design rests on people understanding that the
 * system acted because a number cleared a line, and held back when it did not.
 * A bare percentage does not say that; a bar with the line on it does.
 */
function Confidence({ value = 0, threshold = 0.6, label }) {
  const clear = value >= threshold;
  return (
    <div style={{ minWidth: 92 }}>
      {label && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>}
      <div
        title={`confidence ${value.toFixed(2)} · acts at ${threshold}`}
        style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.round(value * 100)}%`, background: clear ? 'var(--accent-primary)' : 'var(--warning)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.round(threshold * 100)}%`, width: 2, background: 'rgba(255,255,255,.6)' }} />
      </div>
      <div style={{ fontSize: 11, color: clear ? 'var(--text-secondary)' : 'var(--warning)', marginTop: 3 }}>
        {value.toFixed(2)} {clear ? '· acted' : '· held for review'}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="glass-card" style={{ padding: '1rem 1.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em' }}>
        {Icon && <Icon size={14} />} {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-.02em', color: tone ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{note}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- page  */

export default function JevSentinel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('triage');

  const load = useCallback(async (rerun = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/${rerun ? 'run' : 'dashboard'}`, {
        method: rerun ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: rerun ? '{}' : undefined,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bands = useMemo(() => {
    if (!data) return [];
    const order = ['P1', 'P2', 'P3', 'P4'];
    return order.map((b) => ({ band: b, count: data.portfolio.signalsByPriority[b] ?? 0 }));
  }, [data]);

  if (error) {
    return (
      <div className="glass-card" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={18} color="var(--danger)" /> Jev layer unreachable</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{error}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
          Mount the router in <code>server/server.js</code> — see <code>docs/INTEGRATION.md</code> — or run it standalone with <code>npm run serve</code> and set <code>VITE_JEV_API</code>.
        </p>
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => load()}>Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', padding: '3rem 0' }}>
        <Loader2 size={18} className="animate-spin" /> Asking Jev…
      </div>
    );
  }

  const L = data.ledger;
  const P = data.portfolio;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: 26 }}>CX Sentinel</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '68ch', marginTop: 4 }}>
            Every inbound message, every account and every outgoing draft judged by Jev — typed decisions
            with a confidence this app can branch on, instead of prose somebody has to read.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => load(true)} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-run
        </button>
      </div>

      {data.simulated && (
        <div className="glass-card" style={{ marginTop: 16, padding: '.8rem 1rem', background: 'rgba(245,158,11,.08)', borderColor: 'rgba(245,158,11,.25)' }}>
          <strong style={{ color: 'var(--warning)' }}>Offline simulator.</strong>{' '}
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            No Jev call was made. The request shapes, the confidence gate, the ledger and this page are real;
            the verdicts are lexical, not intelligent. Set <code>JEV_PROVIDER</code> and <code>JEV_API_KEY</code> to run it against the model.
          </span>
        </div>
      )}

      <div className="dashboard-grid" style={{ marginTop: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Tile icon={Zap} label="Signals judged" value={P.signals} note={`${data.accounts.length} accounts`} />
        <Tile icon={Gauge} label="Typed decisions" value={L.decisions.toLocaleString()} note={`${L.decisionsPerCall} per call`} />
        <Tile icon={ArrowUpRight} label="Cost" value={usd(L.cost.modelledUsd)} note={`${usd(L.cost.perDecisionUsd)} per decision`} />
        <Tile icon={Clock} label="Median latency" value={`${L.latency.p50Ms} ms`} note={`p90 ${L.latency.p90Ms} ms`} />
        <Tile icon={CheckCircle2} label="Autonomy rate" value={pct(L.gate.meanAutonomyRate)} note={`${L.gate.totalUncertain} held for review`} />
        <Tile icon={ShieldAlert} label="Value at risk" value={usd(P.valueAtRiskUsd)} note={`${P.accountsAtRisk.length} accounts`} tone="var(--danger)" />
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '26px 0 14px', flexWrap: 'wrap' }}>
        {[['triage', `Triage (${data.signals.length})`], ['accounts', `Accounts (${data.accounts.length})`], ['outbound', `Outbound QA (${data.replies.length})`], ['ledger', 'Ledger']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'btn btn-primary' : 'btn btn-ghost'} style={{ padding: '.5rem 1rem', fontSize: 13 }} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'triage' && <Triage signals={data.signals} bands={bands} />}
      {tab === 'accounts' && <Accounts accounts={data.accounts} />}
      {tab === 'outbound' && <Outbound replies={data.replies} />}
      {tab === 'ledger' && <Ledger ledger={L} portfolio={P} wallClockMs={data.wallClockMs} />}

      <p style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 34, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
        Provider <strong>{data.provider}</strong>. Jev is TypeSafe AI’s System One model, released 15 September 2026.
        Prices and limits shown are TypeSafe’s published figures. This project is not affiliated with TypeSafe AI.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- panels */

const FLAGS = [
  ['churn_signal', 'churn'], ['expansion_signal', 'expansion'], ['advocacy_signal', 'advocacy'],
  ['blocked_now', 'blocked'], ['exec_escalation', 'exec'], ['contractual_risk', 'contractual'],
  ['security_or_privacy', 'security'], ['sla_breach_risk', 'SLA risk'], ['onboarding_blocker', 'onboarding'],
  ['usage_decline', 'usage falling'], ['feature_request', 'feature req'], ['mentions_competitor', 'competitor'],
];

function Triage({ signals, bands }) {
  const sorted = [...signals].sort((a, b) => b.priority.score - a.priority.score);
  return (
    <>
      <div className="glass-card" style={{ height: 150, padding: '1rem' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bands} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <XAxis dataKey="band" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {bands.map((b) => (
                <Cell key={b.band} fill={{ P1: 'var(--danger)', P2: 'var(--warning)', P3: 'var(--info)', P4: 'var(--bg-tertiary)' }[b.band]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {sorted.map((s) => {
          const a = s.answers;
          const flags = FLAGS.filter(([id]) => (a[id]?.noul ?? 0) >= 0.7);
          return (
            <div key={s.signal.id} className="glass-card" style={{ padding: '.95rem 1.1rem' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <span className={`badge ${BAND_CLASS[s.priority.band]}`}>{s.priority.band}</span>
                <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {s.signal.subject ?? s.signal.id}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}> · {s.account?.name} · {s.signal.channel}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, marginTop: 4 }}>
                    {s.signal.body.slice(0, 190)}{s.signal.body.length > 190 ? '…' : ''}
                  </div>
                  {flags.length > 0 && (
                    <div style={{ marginTop: 7, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {flags.map(([id, label]) => (
                        <span key={id} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(99,102,241,.14)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,.25)' }}>{label}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>sentiment</div>{a.sentiment?.choice}</div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>urgency</div>{a.urgency?.score}/4</div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>effort</div>{a.effort?.score}/4</div>
                  <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>queue</div>{s.queue}</div>
                  <Confidence label="routing" value={a.routing_team?.confidence ?? 0} threshold={0.55} />
                </div>
              </div>
              {s.escalations.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--warning)' }}>
                  Unsure on a consequential question — sent to a person or a larger model: {s.escalations.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Accounts({ accounts }) {
  const sorted = [...accounts].sort((a, b) => (b.answers.renewal_risk?.score ?? 0) - (a.answers.renewal_risk?.score ?? 0));
  return (
    <div className="dashboard-grid">
      {sorted.map((a) => {
        const risk = a.answers.renewal_risk?.score ?? 0;
        const Trend = { improving: TrendingUp, declining: TrendingDown }[a.answers.outlook?.choice] ?? null;
        return (
          <div key={a.account.id} className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 16 }}>{a.account.name}</h3>
              <span className={`badge ${GRADE_CLASS[a.derived.healthGrade] ?? 'badge-info'}`}>{a.derived.healthGrade}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              CXM-Tool records “{a.account.health}” · {a.account.value} · renews {a.account.renewals}
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 5, fontSize: 12.5 }}>
              <Row k="Renewal risk" v={`${risk}/4`} />
              <Row k="Value at risk" v={usd(a.derived.valueAtRisk)} tone={risk >= 2.5 ? 'var(--danger)' : undefined} />
              <Row k="Primary driver" v={a.answers.primary_risk_driver?.choice ?? '—'} />
              <Row k="Value realised" v={`${a.answers.value_realisation?.score ?? '—'}/4`} />
              <Row k="Engagement depth" v={`${a.answers.engagement_depth?.score ?? '—'}/4`} />
              <Row k="Outlook" v={<span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{Trend && <Trend size={13} />}{a.answers.outlook?.choice ?? '—'}</span>} />
            </div>

            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recommended play</div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{a.answers.recommended_play?.choice ?? '—'}</div>
              <div style={{ marginTop: 8 }}>
                <Confidence value={a.answers.recommended_play?.confidence ?? 0} threshold={0.6} />
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              {a.evidence.signalsIncluded} signals of evidence
              {a.evidence.signalsDropped > 0 && `, ${a.evidence.signalsDropped} dropped for budget`} · {a.latencyMs} ms
              {a.derived.thinEvidence && <strong style={{ color: 'var(--warning)' }}> · thin evidence, treat this verdict as weak</strong>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,.04)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <strong style={{ color: tone ?? 'var(--text-primary)' }}>{v}</strong>
    </div>
  );
}

function Outbound({ replies }) {
  const LABEL = { send: ['Send', 'badge-success'], send_after_edit: ['Edit first', 'badge-warning'], hold_for_human: ['Hold', 'badge-danger'] };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {replies.map((r) => {
        const [label, cls] = LABEL[r.decision] ?? ['—', 'badge-info'];
        return (
          <div key={r.signalId} className="glass-card" style={{ padding: '.95rem 1.1rem' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge ${cls}`}>{label}</span>
              <strong style={{ fontSize: 13 }}>answering {r.signalId}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>readiness: {r.readiness ?? '—'}</span>
              <div style={{ display: 'flex', gap: 18, marginLeft: 'auto', fontSize: 12 }}>
                <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>supported</div>{pct(r.answers.factually_supported?.noul)}</div>
                <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>commits</div>{pct(r.answers.makes_a_commitment?.noul)}</div>
                <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>legal</div>{pct(r.answers.legally_sensitive?.noul)}</div>
                <div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>clarity</div>{r.clarity ?? '—'}/4</div>
              </div>
            </div>
            {r.blockers.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                Held regardless of the readiness verdict — a blocker vetoes the send: {r.blockers.join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Ledger({ ledger: L, portfolio: P, wallClockMs }) {
  return (
    <div className="dashboard-grid">
      <div className="glass-card">
        <h3 style={{ fontSize: 15 }}>This run</h3>
        <div style={{ marginTop: 10, display: 'grid', gap: 5, fontSize: 12.5 }}>
          <Row k="Calls" v={L.calls} />
          <Row k="Typed decisions" v={L.decisions.toLocaleString()} />
          <Row k="Input tokens" v={L.inputTokens.toLocaleString()} />
          <Row k="Cost" v={usd(L.cost.modelledUsd)} />
          <Row k="Decisions per dollar" v={L.cost.decisionsPerDollar?.toLocaleString() ?? '—'} />
          <Row k="Wall clock" v={`${(wallClockMs / 1000).toFixed(1)} s`} />
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ fontSize: 15 }}>Against {L.comparedWith.baseline}</h3>
        <div style={{ marginTop: 10, display: 'grid', gap: 5, fontSize: 12.5 }}>
          <Row k={`Same ${L.calls} cases would cost`} v={usd(L.comparedWith.baselineCostUsd)} />
          <Row k="and take" v={`${L.comparedWith.baselineSeconds} s`} />
          <Row k="Cheaper by" v={`~${L.comparedWith.cheaperBy}×`} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>{L.comparedWith.note}</p>
      </div>

      <div className="glass-card">
        <h3 style={{ fontSize: 15 }}>The gate</h3>
        <div style={{ marginTop: 10, display: 'grid', gap: 5, fontSize: 12.5 }}>
          <Row k="Cleared the bar" v={pct(L.gate.meanAutonomyRate)} />
          <Row k="Sent for review" v={L.gate.totalUncertain} />
          <Row k="Escalated" v={L.gate.totalEscalations} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          Escalated means the answer was below its bar <em>and</em> the decision was consequential
          enough to go to a larger model or a named person rather than a queue.
        </p>
      </div>

      <div className="glass-card">
        <h3 style={{ fontSize: 15 }}>Root causes across the portfolio</h3>
        <div style={{ marginTop: 10, display: 'grid', gap: 5, fontSize: 12.5 }}>
          {P.rootCauseRanking.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nothing recorded.</span>
            : P.rootCauseRanking.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </div>
      </div>
    </div>
  );
}
