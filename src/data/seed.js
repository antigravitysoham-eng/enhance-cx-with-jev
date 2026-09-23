/**
 * seed.js — a demo corpus.
 *
 * The six accounts are the ones in CXM-Tool's own `src/utils/mockData.js`, kept
 * identical (names, values, renewal dates, health, progress) so the engine can
 * be pointed at the real app without a mapping layer. Everything else — the
 * contacts, the 30 signals, the draft replies — is written here, because the
 * CXM Tool has a customer directory but no customer *voice*, and the voice is
 * what Jev judges.
 *
 * The corpus is deliberately awkward. It contains polite messages that are
 * really churn, angry messages that are really nothing, a cancellation that is
 * a bluff, a compliment that is a reference opportunity, a quiet account with
 * almost no evidence, and a couple of near-ties. If a decision layer only works
 * on the clear cases, it does not work.
 */

export const accounts = [
  {
    id: 1, name: 'Acme Corp', type: 'Customer', csm: 'Sarah J.', health: 'Critical',
    value: '$45,000', renewals: 'Oct 12, 2026', progress: 85, industry: 'SaaS',
    plan: 'Growth', supportTier: 'Standard (next business day)',
    seats: { licensed: 120, used: 71 },
    contacts: [
      { name: 'Dana Whitfield', role: 'Head of RevOps, economic buyer' },
      { name: 'Priyanka Rao', role: 'Billing administrator' },
    ],
  },
  {
    id: 2, name: 'Global Tech', type: 'Customer', csm: 'Mark O.', health: 'Poor',
    value: '$120,000', renewals: 'Oct 24, 2026', progress: 40, industry: 'FinTech',
    plan: 'Enterprise', supportTier: 'Premium (4-hour response, 99.9% uptime SLA)',
    seats: { licensed: 400, used: 96 },
    contacts: [
      { name: 'Marcus Feld', role: 'CTO, executive sponsor' },
      { name: 'Ingrid Sollie', role: 'Platform engineering lead' },
      { name: 'Tom Barrow', role: 'Procurement' },
    ],
  },
  {
    id: 3, name: 'Nexus Solutions', type: 'Prospect', csm: 'Sarah J.', health: 'Stable',
    value: '$32,500', renewals: 'Nov 02, 2026', progress: 15, industry: 'E-commerce',
    plan: 'Trial', supportTier: 'Standard (next business day)',
    seats: { licensed: 25, used: 9 },
    contacts: [{ name: 'Yusuf Adeyemi', role: 'Director of Customer Operations' }],
  },
  {
    id: 4, name: 'Stellar Innovations', type: 'Partner', csm: 'Elena R.', health: 'Good',
    value: '$84,000', renewals: 'Nov 15, 2026', progress: 100, industry: 'AI',
    plan: 'Enterprise', supportTier: 'Premium (4-hour response)',
    seats: { licensed: 200, used: 188 },
    contacts: [
      { name: 'Lena Fischer', role: 'VP Product' },
      { name: 'Ade Okonkwo', role: 'Integration architect' },
    ],
  },
  {
    id: 5, name: 'Cloud Nine', type: 'Customer', csm: 'David K.', health: 'Good',
    value: '$60,000', renewals: 'Dec 05, 2026', progress: 95, industry: 'Cloud',
    plan: 'Growth', supportTier: 'Standard (next business day)',
    seats: { licensed: 150, used: 141 },
    contacts: [{ name: 'Rosa Marín', role: 'Head of Support' }],
  },
  {
    id: 6, name: 'Velocity Systems', type: 'Prospect', csm: 'Mark O.', health: 'Neutral',
    value: '$55,000', renewals: 'N/A', progress: 10, industry: 'Logistics',
    plan: 'Pilot', supportTier: 'Standard (next business day)',
    seats: { licensed: 40, used: 3 },
    contacts: [{ name: 'Henrik Bauer', role: 'Operations Manager' }],
  },
];

export const signals = [
  /* ---------------------------------------------------------------- Acme Corp
     A renewal three weeks out, a health flag already set to Critical, and a
     buyer who is polite right up until she is not. */
  {
    id: 'sig-001', accountId: 1, channel: 'email', receivedAt: '2026-09-22T08:14:00Z',
    subject: 'Re: Re: Re: Stripe connection still failing',
    from: { name: 'Priyanka Rao', role: 'Billing administrator' },
    body: `This is the fourth time I am writing about this. The Stripe connection drops every two or three days and we have to re-authorise it by hand. Each time it drops we stop collecting, and yesterday that was about eleven hours before anyone noticed. I have sent the logs twice. The last person told me it was fixed on the 11th and it was not. I do not know who else to contact.`,
    history: [
      { at: '2026-09-04', summary: 'Reported Stripe re-auth loop, asked for logs', status: 'closed' },
      { at: '2026-09-11', summary: 'Told the issue was resolved in release 4.18', status: 'closed' },
      { at: '2026-09-17', summary: 'Reopened, no reply in 5 days', status: 'open' },
    ],
    openItems: [
      { ref: 'ENG-4412', title: 'Stripe OAuth token refresh fails intermittently', openedAt: '2026-09-04', severity: 'high' },
    ],
  },
  {
    id: 'sig-002', accountId: 1, channel: 'email', receivedAt: '2026-09-22T16:40:00Z',
    subject: 'Renewal — pausing the conversation',
    from: { name: 'Dana Whitfield', role: 'Head of RevOps, economic buyer' },
    body: `Hi Sarah. I want to be straight with you rather than go quiet. We are three weeks from renewal and I cannot take a £45k line item to my CFO while the billing integration is still dropping. I have asked the team to put together a comparison against Loomis and one other vendor. Nothing is decided, and honestly I would rather not move — the reporting side has been good for us. But I need to see the integration stable for a fortnight and I need something in writing about what happens if it is not.`,
    history: [{ at: '2026-08-20', summary: 'Positive QBR, discussed adding the EMEA team', status: 'closed' }],
    openItems: [{ ref: 'ENG-4412', title: 'Stripe OAuth token refresh fails intermittently', openedAt: '2026-09-04', severity: 'high' }],
  },
  {
    id: 'sig-003', accountId: 1, channel: 'survey', receivedAt: '2026-09-19T11:02:00Z',
    subject: 'NPS survey — score 3',
    from: { name: 'Priyanka Rao', role: 'Billing administrator' },
    body: `Score: 3/10. "The product does what it says when it works. Getting help when it does not work is the problem. I have never spoken to the same person twice."`,
  },
  {
    id: 'sig-004', accountId: 1, channel: 'in_app', receivedAt: '2026-09-21T09:30:00Z',
    subject: 'Question about scheduled exports',
    from: { name: 'Owen Blake', role: 'Analyst' },
    body: `Is there a way to schedule the revenue export to run on the last working day of the month rather than the last calendar day? Not urgent, just tidying up our month-end.`,
  },

  /* -------------------------------------------------------------- Global Tech
     Biggest contract, Premium SLA with a 4-hour clock, a CTO sponsor, and an
     implementation stuck at 40% four months in. */
  {
    id: 'sig-005', accountId: 2, channel: 'email', receivedAt: '2026-09-22T06:05:00Z',
    subject: 'URGENT — production incident, no response in 9 hours',
    from: { name: 'Ingrid Sollie', role: 'Platform engineering lead' },
    body: `We raised a P1 at 21:00 UTC yesterday. Our reconciliation jobs have been failing with 500s from your API since the deploy on the 21st. Nine hours, no acknowledgement. Our contract says four. We have 400 licensed seats and cannot run end of day. Marcus is asking me directly what our options are and I do not have an answer for him.`,
    history: [
      { at: '2026-09-21T21:00Z', summary: 'P1 raised via portal, auto-acknowledged only', status: 'open' },
      { at: '2026-09-22T02:00Z', summary: 'Chased on the shared Slack channel, no reply', status: 'open' },
    ],
    openItems: [
      { ref: 'INC-0912', title: 'Reconciliation API returning 500 after release 4.19', openedAt: '2026-09-21', severity: 'critical' },
      { ref: 'ENG-4380', title: 'SSO group sync incomplete for 300 users', openedAt: '2026-08-02', severity: 'medium' },
    ],
  },
  {
    id: 'sig-006', accountId: 2, channel: 'email', receivedAt: '2026-09-22T10:20:00Z',
    subject: 'Formal notice of SLA breach',
    from: { name: 'Tom Barrow', role: 'Procurement' },
    body: `Please treat this as formal notification under clause 8.3 of our master services agreement. The incident raised at 21:00 UTC on 21 September exceeded the contracted four-hour response window. We are recording the breach and reserve our rights in respect of the service credits set out in schedule 2. Please direct your response to me and copy our legal team at the address on file.`,
  },
  {
    id: 'sig-007', accountId: 2, channel: 'call_note', receivedAt: '2026-09-18T15:00:00Z',
    subject: 'Call note — Marcus Feld (CTO)',
    from: { name: 'Mark O.', role: 'CSM, internal note' },
    body: `Marcus was measured but clear. Four months in, 96 of 400 seats active. He said the board asked him last week what the platform has delivered and he did not have a good answer. Sees the SSO group sync problem as the reason adoption stalled — his teams will not onboard people manually. Wants a written plan with dates. Said twice that he "backed this internally" and it is his name on it. Did not mention leaving. Renewal is 24 October.`,
  },
  {
    id: 'sig-008', accountId: 2, channel: 'email', receivedAt: '2026-09-16T12:00:00Z',
    subject: 'SSO group sync — still only partial',
    from: { name: 'Ingrid Sollie', role: 'Platform engineering lead' },
    body: `Following up on ENG-4380. We are still seeing about 300 users who exist in Okta but never appear in your platform. We have re-run the sync four times now with the settings your team gave us. At this point we have stopped rolling out to new teams because we cannot get them in.`,
    openItems: [{ ref: 'ENG-4380', title: 'SSO group sync incomplete for 300 users', openedAt: '2026-08-02', severity: 'medium' }],
  },
  {
    id: 'sig-009', accountId: 2, channel: 'in_app', receivedAt: '2026-09-20T08:45:00Z',
    subject: 'Audit log export format',
    from: { name: 'Ingrid Sollie', role: 'Platform engineering lead' },
    body: `Our auditors need the audit log in a format that includes the actor's email rather than the internal user ID. Is that configurable, or do we need to join it against the user export ourselves? We have a compliance review on 15 October.`,
  },

  /* ---------------------------------------------------------- Nexus Solutions
     A prospect in trial. Every message here is a buying signal or an objection,
     and none of them are support. */
  {
    id: 'sig-010', accountId: 3, channel: 'email', receivedAt: '2026-09-22T13:10:00Z',
    subject: 'Trial going well — what does 80 seats look like?',
    from: { name: 'Yusuf Adeyemi', role: 'Director of Customer Operations' },
    body: `We have had nine people on it for two weeks and the feedback is good. Our head of CS wants to bring her whole team across, which would be about 80 seats rather than the 25 we trialled. Budget for this is approved for Q4. Two things before we sign: can you confirm the data residency options for the EU, and do you have a security questionnaire we can put through our review process?`,
  },
  {
    id: 'sig-011', accountId: 3, channel: 'in_app', receivedAt: '2026-09-19T10:00:00Z',
    subject: 'Import failed halfway',
    from: { name: 'Sam Oduya', role: 'Operations analyst' },
    body: `The CSV import stopped at row 4,102 with "unexpected token". The file opens fine in Excel. I have attached it. Not blocking us, I just rebuilt it by hand, but it will be a problem when we do the real migration.`,
  },
  {
    id: 'sig-012', accountId: 3, channel: 'survey', receivedAt: '2026-09-21T09:00:00Z',
    subject: 'Trial check-in survey',
    from: { name: 'Yusuf Adeyemi', role: 'Director of Customer Operations' },
    body: `Score: 9/10. "Genuinely faster than what we had. We cut our first-response time from about six hours to under one in the pilot group. Happy to say so publicly if that is useful to you."`,
  },

  /* ------------------------------------------------------ Stellar Innovations
     Healthy, fully onboarded, nearly all seats in use. The interesting signals
     here are growth and advocacy, not risk. */
  {
    id: 'sig-013', accountId: 4, channel: 'email', receivedAt: '2026-09-22T09:00:00Z',
    subject: 'Case study — yes',
    from: { name: 'Lena Fischer', role: 'VP Product' },
    body: `Happy to do the case study. The number you can use is the one from our board deck: we cut time-to-resolution by 41% in the first two quarters, and we retired two internal tools. I can get marketing approval this week. Would also like to talk about the partner tier — we have three of our own customers asking who we use.`,
  },
  {
    id: 'sig-014', accountId: 4, channel: 'in_app', receivedAt: '2026-09-21T14:22:00Z',
    subject: 'Webhook retries',
    from: { name: 'Ade Okonkwo', role: 'Integration architect' },
    body: `Quick one — does the webhook retry schedule back off exponentially, and is the maximum retry window configurable? The docs mention retries but not the schedule. Building a dead-letter queue on our side and want to match it.`,
  },
  {
    id: 'sig-015', accountId: 4, channel: 'email', receivedAt: '2026-09-15T11:30:00Z',
    subject: 'Feature request: bulk reassignment',
    from: { name: 'Lena Fischer', role: 'VP Product' },
    body: `One thing that would save us real time: reassigning all of one owner's accounts in bulk when someone leaves. We currently do it one at a time and it took a day when our last CSM moved on. Any plans for that?`,
  },
  {
    id: 'sig-016', accountId: 4, channel: 'call_note', receivedAt: '2026-09-12T16:00:00Z',
    subject: 'Call note — quarterly review',
    from: { name: 'Elena R.', role: 'CSM, internal note' },
    body: `Strong review. 188 of 200 seats in daily use. Lena brought two of her own product leads. They want the partner tier and asked about co-selling. No open technical issues. Asked about our roadmap for bulk operations — this is the third time it has come up.`,
  },

  /* --------------------------------------------------------------- Cloud Nine
     The quiet one. Good on paper, almost nothing in the inbox — which is
     exactly the case a health score built on activity counts gets wrong. */
  {
    id: 'sig-017', accountId: 5, channel: 'in_app', receivedAt: '2026-09-20T13:15:00Z',
    subject: 'Password reset not arriving',
    from: { name: 'Jo Tanaka', role: 'Support agent' },
    body: `Reset email is not coming through for one of our agents. Checked spam. Other agents are fine.`,
  },
  {
    id: 'sig-018', accountId: 5, channel: 'email', receivedAt: '2026-09-08T10:00:00Z',
    subject: 'Out of office until 29 September',
    from: { name: 'Rosa Marín', role: 'Head of Support' },
    body: `Thanks for the check-in note. I am out until the 29th — let us pick the review up when I am back. Nothing pressing at our end.`,
  },

  /* --------------------------------------------------------- Velocity Systems
     A pilot that never started. Three seats used out of forty. Silence and
     politeness dressed as progress. */
  {
    id: 'sig-019', accountId: 6, channel: 'email', receivedAt: '2026-09-22T11:45:00Z',
    subject: 'Re: Pilot kickoff — rescheduling again',
    from: { name: 'Henrik Bauer', role: 'Operations Manager' },
    body: `Apologies, I need to move Thursday again. Things are busy on our side with the peak season planning and honestly the pilot has not been a priority. Two of the three people I nominated have been pulled onto another project. Can we look at this again in November? I do not want to waste your time either.`,
    history: [
      { at: '2026-08-14', summary: 'Kickoff scheduled', status: 'cancelled' },
      { at: '2026-08-28', summary: 'Kickoff rescheduled', status: 'cancelled' },
      { at: '2026-09-11', summary: 'Kickoff rescheduled', status: 'cancelled' },
    ],
  },
  {
    id: 'sig-020', accountId: 6, channel: 'in_app', receivedAt: '2026-09-05T09:00:00Z',
    subject: 'How do I add a user?',
    from: { name: 'Henrik Bauer', role: 'Operations Manager' },
    body: `Where is the option to add a user? I looked under settings and could not see it.`,
  },

  /* -------------------------------------------------- Deliberately hard cases
     Near-ties, misleading tone, and messages designed to be filed wrongly by
     anything that keys off sentiment alone. */
  {
    id: 'sig-021', accountId: 5, channel: 'email', receivedAt: '2026-09-22T15:50:00Z',
    subject: 'Thank you — and a question about winding down one workspace',
    from: { name: 'Rosa Marín', role: 'Head of Support' },
    body: `First, thank you — the team have been great with us this year and I have said so internally. Second, a practical question. We are consolidating two support desks into one, and that means one of our two workspaces will be retired at the end of November. What is the cleanest way to export everything from it, and does that change our seat count for December?`,
  },
  {
    id: 'sig-022', accountId: 4, channel: 'email', receivedAt: '2026-09-22T07:30:00Z',
    subject: 'This is completely unacceptable',
    from: { name: 'Ade Okonkwo', role: 'Integration architect' },
    body: `Sorry for the subject line, I was writing it at 3am. The sandbox environment was down for about twenty minutes last night while I was testing. It came back on its own. I do not need anything from you, I just wanted it on record in case it happens during our release window next Tuesday.`,
  },
  {
    id: 'sig-023', accountId: 2, channel: 'email', receivedAt: '2026-09-14T08:00:00Z',
    subject: 'Security questionnaire — annual review',
    from: { name: 'Tom Barrow', role: 'Procurement' },
    body: `Attached is our annual vendor security questionnaire. We need it back by 10 October with your current SOC 2 report and your sub-processor list. Standard process, no concerns on our side, but the deadline is firm because it feeds our regulator submission.`,
  },
  {
    id: 'sig-024', accountId: 1, channel: 'chat', receivedAt: '2026-09-22T17:05:00Z',
    subject: 'Live chat transcript',
    from: { name: 'Priyanka Rao', role: 'Billing administrator' },
    body: `[17:01] Priyanka: it has dropped again
[17:01] Priyanka: third time this week
[17:02] Agent: I'm sorry to hear that. Can you confirm your account ID?
[17:02] Priyanka: you have asked me for that five times, it is ACM-4471
[17:03] Priyanka: I am going to stop chasing this. I have told Dana it is not fixed.
[17:03] Agent: Let me raise this with the team.
[17:04] Priyanka has left the chat`,
  },
  {
    id: 'sig-025', accountId: 3, channel: 'email', receivedAt: '2026-09-17T14:00:00Z',
    subject: 'Pricing — one concern',
    from: { name: 'Yusuf Adeyemi', role: 'Director of Customer Operations' },
    body: `One thing I should flag early. The per-seat price at 80 seats is about 30% above what we budgeted, because our finance team modelled it on the trial rate. I am not asking for a discount before we have even started, but if there is a volume tier I should know about it now rather than in November.`,
  },
  {
    id: 'sig-026', accountId: 2, channel: 'in_app', receivedAt: '2026-09-22T12:00:00Z',
    subject: 'Are you aware of the API errors?',
    from: { name: 'Priyesh Nanda', role: 'Backend developer' },
    body: `Getting 500s from /v1/reconcile since yesterday afternoon. Is there a status page? I could not find one linked anywhere in the product.`,
  },
  {
    id: 'sig-027', accountId: 4, channel: 'survey', receivedAt: '2026-09-20T16:00:00Z',
    subject: 'CSAT — score 5/5',
    from: { name: 'Ade Okonkwo', role: 'Integration architect' },
    body: `Score: 5/5. "Ticket answered in under an hour with an actual answer rather than a link to the docs. More of that."`,
  },
  {
    id: 'sig-028', accountId: 6, channel: 'survey', receivedAt: '2026-09-02T10:00:00Z',
    subject: 'Pilot onboarding survey — no response',
    from: { name: 'system', role: 'automated' },
    body: `Survey sent to 3 nominated pilot users on 26 August. No responses received after two reminders. Survey closed automatically.`,
  },
  {
    id: 'sig-029', accountId: 1, channel: 'call_note', receivedAt: '2026-09-22T18:00:00Z',
    subject: 'Call note — attempted call to Dana Whitfield',
    from: { name: 'Sarah J.', role: 'CSM, internal note' },
    body: `Called Dana after her email. Went to voicemail. Left a message offering a call tomorrow with engineering on the line and a written remediation plan by Friday. Also spoke to Priyanka briefly — she is done with the chat channel and asked that everything go through Dana now. Renewal is 12 October, twenty days out.`,
  },
  {
    id: 'sig-030', accountId: 5, channel: 'in_app', receivedAt: '2026-09-22T11:11:00Z',
    subject: 'Can we get the old export back?',
    from: { name: 'Jo Tanaka', role: 'Support agent' },
    body: `The CSV export changed last week and the column order is different, which broke the macro our reporting person built. Is the old format still available anywhere? It is more annoying than serious but she has asked me twice now.`,
  },
];

/**
 * Draft replies for the outbound QA pass.
 *
 * Written the way an agent or an LLM would write them — fluent, confident, and
 * in two cases wrong in a way a person skim-reading would miss. That is the
 * point: pass 3 exists because fluent and correct are different properties.
 */
export const draftReplies = [
  {
    signalId: 'sig-001',
    draft: `Hi Priyanka,

Thanks for your patience. I can confirm the Stripe token refresh bug was fully resolved in release 4.18 and you should not see the issue again. If it does recur, please open a new ticket and we will prioritise it.

We have also credited your account with one month of service as an apology.

Best,
Support`,
    knownFacts: [
      'ENG-4412 (Stripe OAuth token refresh fails intermittently) was opened 4 September 2026 and remains OPEN.',
      'Release 4.18 included a partial fix that did not resolve the reported behaviour.',
      'No service credit has been approved for Acme Corp. Credits require CSM and finance sign-off.',
      'Acme Corp is on the Standard support tier, which carries no uptime SLA.',
    ],
  },
  {
    signalId: 'sig-005',
    draft: `Ingrid,

You're right, and I'm sorry — we missed the four-hour window on INC-0912 and there's no good excuse for that. Here's where we are: the 500s are coming from a change in release 4.19, we've identified the cause, and a fix is going out today. I'll confirm here the moment it's deployed.

On the SLA: I've asked our account team to look at the service credit under schedule 2, and Tom's note has gone to them directly.

I'll stay on this until your reconciliation jobs run clean.

Mark`,
    knownFacts: [
      'INC-0912 was raised 21 September 2026 at 21:00 UTC; first human acknowledgement was at 06:40 UTC on 22 September, outside the contracted 4-hour window.',
      'The 500 errors were traced to release 4.19 on 21 September.',
      'A fix is in staging and scheduled for deployment on 22 September.',
      'Global Tech is on Premium support: 4-hour response, 99.9% uptime SLA, service credits under schedule 2.',
    ],
  },
  {
    signalId: 'sig-010',
    draft: `Hi Yusuf,

Great to hear. On your two questions:

1. EU data residency — yes, we host in Frankfurt and you can pin your workspace to the EU region at any time.
2. Security questionnaire — attached, along with our SOC 2 Type II report.

On 80 seats, I can do 20% off list if you sign before the end of the month. That's the best anyone gets.

Happy to get a contract over today.`,
    knownFacts: [
      'EU data residency is available; the region is Frankfurt and it must be selected at workspace creation, not changed afterwards.',
      'A SOC 2 Type II report and a standard security questionnaire response pack exist and can be shared under NDA.',
      'Discount authority at this deal size sits with sales leadership. No discount has been approved for Nexus Solutions.',
    ],
  },
  {
    signalId: 'sig-013',
    draft: `Lena,

Wonderful — thank you. I'll send the case study brief over this afternoon and we can work to your marketing team's timeline.

On the partner tier: I'd love to explore that. Can we get 30 minutes with you and Elena next week to walk through how co-selling works and what the referral economics look like?

And the 41% figure is exactly the kind of result we'd want to lead with, if your team is comfortable with it being public.`,
    knownFacts: [
      'Stellar Innovations is a Partner-type account with a $84,000 contract renewing 15 November 2026.',
      'A partner tier with co-selling and referral terms exists and is owned by the partnerships team.',
      'The 41% time-to-resolution figure is the customer’s own, from their board deck.',
    ],
  },
  {
    signalId: 'sig-019',
    draft: `No problem at all Henrik, November works for us. I'll close out the pilot workspace in the meantime to keep things tidy and we can spin a fresh one up when you're ready.

Enjoy peak season!`,
    knownFacts: [
      'Velocity Systems is a Prospect on a Pilot plan, 3 of 40 seats used, onboarding 10% complete.',
      'The kickoff has been cancelled three times: 14 August, 28 August, 11 September.',
      'Closing a pilot workspace deletes its configuration and cannot be undone.',
      'No renewal date is set for this account.',
    ],
  },
];

export default { accounts, signals, draftReplies };
