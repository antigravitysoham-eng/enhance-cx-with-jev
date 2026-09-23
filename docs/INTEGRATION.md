# Dropping CX Sentinel into CXM-Tool

Written against the CXM-Tool repo as it stands: React 19 + Vite on 5173, Express + SQLite on
5000, `src/styles/design-system.css` for tokens, `src/utils/mockData.js` for the six demo
accounts.

Four steps, about ten minutes.

---

## 1. Put the two repos side by side

```
your-workspace/
├── CXM-Tool/
└── Enhance-CX-with-Jev/
```

Nothing to install. This package has **zero dependencies** — Express is a peer, never
imported, so it cannot drag a second copy into an app that already has one.

## 2. Mount the router

`CXM-Tool/server/server.js`, after `app.use(express.json())`:

```js
import { jevRouter } from '../../enhance-cx-with-jev/src/server/router.js';

// The decision layer. Provider comes from the environment; with no key set it
// runs the offline simulator and says so in every response.
app.use('/api/jev', jevRouter());
```

Then in `CXM-Tool/server/.env`:

```
JEV_PROVIDER=simulator
# JEV_PROVIDER=direct
# JEV_API_KEY=sk-...
```

Check it:

```bash
curl localhost:5000/api/jev/health
```

## 3. Add the page

```bash
cp Enhance-CX-with-Jev/integration/cxm-tool/pages/JevSentinel.jsx  CXM-Tool/src/pages/
```

`CXM-Tool/src/App.jsx` — add the route alongside the existing ones:

```jsx
import JevSentinel from './pages/JevSentinel';
// ...
<Route path="/jev" element={<JevSentinel />} />
```

`CXM-Tool/src/components/Sidebar.jsx` — add the nav item. The file already imports from
`lucide-react`, so add `Zap` to that import:

```jsx
{ path: '/jev', label: 'CX Sentinel', icon: Zap },
```

Vite proxies `/api` to 5000 already if `vite.config.js` has a server proxy; if not, add:

```js
server: { proxy: { '/api': 'http://localhost:5000' } }
```

Or run the layer standalone on 5100 and set `VITE_JEV_API=http://localhost:5100/api/jev`.

## 4. Point it at real data

By default the engine runs on its own seed corpus. The six accounts in
`src/data/seed.js` are byte-identical to CXM-Tool's `src/utils/mockData.js` — same names,
values, renewal dates, health strings and progress numbers — so account objects need **no
mapping at all**. There is a test asserting that, and it will fail if either side drifts.

What CXM-Tool does not have is the customer's voice: it tracks accounts, contracts and
milestones, but no inbound messages. That is the gap this layer fills, and it is the one
thing you have to supply.

```js
app.use('/api/jev', jevRouter({
  accounts: () => db.prepare('SELECT * FROM customers').all(),
  signals:  () => db.prepare('SELECT * FROM cx_signals ORDER BY received_at DESC LIMIT 500').all(),
}));
```

A signal needs, at minimum:

```js
{
  id: 'sig-001',
  accountId: 1,
  channel: 'email',          // email | chat | survey | call_note | in_app
  receivedAt: '2026-09-22T08:14:00Z',
  subject: 'Re: Stripe connection still failing',
  from: { name: 'Priyanka Rao', role: 'Billing administrator' },
  body: 'The actual words the customer wrote.',

  // Optional, and worth supplying — several questions cannot be answered well
  // without them:
  history:   [{ at: '2026-09-04', summary: '...', status: 'closed' }],
  openItems: [{ ref: 'ENG-4412', title: '...', openedAt: '2026-09-04', severity: 'high' }],
}
```

---

## Persisting verdicts

The engine is stateless on purpose. CXM-Tool already has SQLite, so two tables are enough.

```sql
CREATE TABLE IF NOT EXISTS cx_signals (
  id            TEXT PRIMARY KEY,
  account_id    INTEGER NOT NULL,
  channel       TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  subject       TEXT,
  from_name     TEXT,
  from_role     TEXT,
  body          TEXT NOT NULL,
  history_json  TEXT,
  open_items_json TEXT
);

CREATE TABLE IF NOT EXISTS cx_verdicts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_kind  TEXT NOT NULL,          -- 'signal' | 'account' | 'reply_qa'
  subject_id    TEXT NOT NULL,
  judged_at     TEXT NOT NULL,
  model         TEXT NOT NULL,          -- 'jev-1.13.0', or 'simulator'
  simulated     INTEGER NOT NULL,       -- never let a simulated verdict pass as real
  rubric_hash   TEXT NOT NULL,          -- which question wording produced this
  answers_json  TEXT NOT NULL,          -- the full typed answers, probabilities included
  gate_json     TEXT NOT NULL,          -- act / review / escalate, per question
  priority      REAL,
  band          TEXT,
  queue         TEXT,
  latency_ms    INTEGER,
  input_tokens  INTEGER,
  cost_usd      REAL
);

CREATE INDEX IF NOT EXISTS idx_verdicts_subject ON cx_verdicts(subject_kind, subject_id, judged_at DESC);
```

Three columns there matter more than they look:

- **`rubric_hash`** — when you reword a criterion, every verdict before that edit was
  produced by a different question. Without this column you will compare them and draw a
  false conclusion about drift.
- **`simulated`** — so a demo verdict can never be counted in a real report.
- **`answers_json` in full**, probabilities included. The probabilities are what
  `calibrate()` needs later, and you cannot reconstruct them from the chosen option.

---

## Where the existing pages get better

| CXM-Tool page | What Jev adds |
|---|---|
| `Dashboard.jsx` | The risk tiles stop being counts of records and start being counts of judgements. `valueAtRiskUsd` is contract value weighted by an evidence-based renewal risk, not a manual flag. |
| `Directory.jsx` | The `health` column is currently hand-set. Show the Jev grade beside it, and the disagreements become the most interesting list in the product. |
| `HealthChecks.jsx` | This is where the account pass belongs. Health, driver, outlook, the play, and `evidence_is_thin` on the quiet ones. |
| `SupportMetrics.jsx` | Root-cause ranking across the whole corpus, not a sample — `root_cause_area` is asked of every signal for a fraction of a cent. |
| `Surveys.jsx` | An NPS comment currently sits next to a number nobody reads. `churn_reason`, `effort` and `reference_quality_evidence` make it actionable. |
| `Comms.jsx` | Pass 3 belongs here: judge the draft before it is sent. |
| `SmartAssistant.jsx` | The assistant keeps writing; Jev decides which account it should be talking about, and whether an action it proposes is safe to run. |
| `Upsells.jsx` / `Referrals.jsx` | `expansion_ready` and `reference_ready` are evidence-based lists rather than a CSM's memory. |

---

## Keeping the two in step

The seed accounts mirror CXM-Tool's mock data, and `test/engine.test.js` asserts it. If you
change one, that test fails — which is the point. When you move CXM-Tool to real customers,
delete that test rather than loosening it.
