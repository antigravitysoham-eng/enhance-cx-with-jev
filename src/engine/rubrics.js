/**
 * rubrics.js — the CX question packs.
 *
 * This file is the actual product. The API call is four lines; the judgement
 * lives here, in how the questions are written.
 *
 * Two rules govern every question below, and both come from how Jev works:
 *
 *  1. The question ID never reaches the model. `churn_risk` tells Jev nothing.
 *     The whole question goes in `instructions`.
 *  2. Each criterion is the *description of a bucket*, not a label. Options have
 *     to be distinguishable from each other by their text alone, because that
 *     text is all the model sees.
 *
 * And one rule that comes from Jev's pricing: questions in a single call are
 * answered in parallel against the same state, so the marginal cost of the 22nd
 * question is close to nothing. A 22-question rubric costs about what one
 * question costs. That is why these packs are deep rather than minimal — it is
 * free to ask, and every extra answer is a column a Customer Success team did
 * not have before.
 */

/* ------------------------------------------------------------------------- *
 * PACK 1 — the signal rubric
 * One inbound artefact: a support ticket, an email, a survey comment, a call
 * note, an in-app message. 22 questions, one call, one round trip.
 * ------------------------------------------------------------------------- */

export const SIGNAL_RUBRIC = {
  routing_team: {
    type: 'choice',
    instructions:
      'Which internal team should own this customer message and reply to it first? Choose the team whose work is needed to actually resolve the problem, not the team that happens to be mentioned.',
    criteria: {
      support: 'A product problem, bug, error, outage or how-to question that front-line support can resolve or reproduce.',
      billing: 'An invoice, payment, card, refund, subscription, plan change, discount or pricing question.',
      onboarding: 'A new or in-flight implementation: kickoff, provisioning, data migration, integration setup, go-live or training.',
      success: 'Relationship work: adoption, business review, roadmap alignment, renewal conversation, usage coaching, an unhappy stakeholder.',
      engineering: 'A confirmed defect or data problem that front-line support cannot resolve without a code or infrastructure change.',
      legal: 'Contract terms, SLA breach, data processing, security review, procurement paperwork or compliance obligations.',
      sales: 'A request to buy more, add seats, change tier, quote a new team, or a pre-sales question from a prospect.',
    },
  },

  urgency: {
    type: 'score',
    instructions:
      'How quickly does someone need to respond to this message before the situation gets materially worse for the customer? Judge the consequence of waiting, not how forcefully the message is written.',
    criteria: [
      'No time pressure at all. A comment, a thank-you, or a question that can wait a week without any harm.',
      'Routine. The customer expects an answer within a normal business day or two, and nothing is blocked meanwhile.',
      'Elevated. Work on the customer side is slowed or a deadline is approaching, and a same-day answer is expected.',
      'Urgent. The customer is blocked right now, losing money or missing a committed date, and hours matter.',
      'Critical. Production is down, revenue is actively being lost, or a contractual or legal deadline is hours away.',
    ],
  },

  sentiment: {
    type: 'choice',
    instructions:
      'What is the overall emotional tone this customer is expressing towards the company in this message?',
    criteria: {
      positive: 'Pleased, grateful or complimentary overall, with no substantive complaint.',
      neutral: 'Matter-of-fact. Asking or reporting without expressing feeling either way.',
      mixed: 'Expresses both appreciation and dissatisfaction in the same message.',
      negative: 'Unhappy or disappointed overall, but still engaged and reasonable in how they put it.',
      hostile: 'Angry and accusatory. Blames us directly, expresses outrage, or threatens consequences.',
    },
  },

  effort: {
    type: 'score',
    instructions:
      'How much work has this customer already had to do to get this issue in front of the right person? Look for repeat contacts, being passed between people, chasing a reply, re-explaining, or being asked for something they already sent.',
    criteria: [
      'None visible. First contact, stated once, clearly.',
      'Slight. One follow-up, or a small amount of re-explaining.',
      'Noticeable. Has chased more than once, or has been handed between people.',
      'High. Repeatedly chased with no resolution, re-sent information, or was bounced between teams.',
      'Severe. Says outright they have given up on the normal channel, or has contacted several times over weeks without resolution.',
    ],
  },

  churn_signal: {
    type: 'noul',
    instructions:
      'This message contains evidence that the customer is considering leaving, not renewing, downgrading, or moving to a competitor. Count explicit statements of intent to cancel and also concrete signals such as naming a competitor they are evaluating, asking about data export or contract exit, or saying leadership has lost confidence. Do not count ordinary complaints with no exit language.',
  },

  expansion_signal: {
    type: 'noul',
    instructions:
      'This message contains evidence that the customer wants to buy more: more seats or licences, a higher tier, another team or region adopting the product, or an explicit mention of approved budget for growth. Do not count general enthusiasm with no purchasing intent behind it.',
  },

  advocacy_signal: {
    type: 'noul',
    instructions:
      'This customer is expressing the kind of satisfaction that makes them a plausible reference, case study, review or referral: unprompted praise of a specific outcome, an offer to speak publicly, or a statement that they recommend the product to others.',
  },

  blocked_now: {
    type: 'noul',
    instructions:
      'The customer is unable to do their work in the product right now because of this issue. Being slowed, annoyed or inconvenienced does not count; they must be stopped.',
  },

  needs_human: {
    type: 'noul',
    instructions:
      'A person must read and handle this rather than an automated reply, because it involves a commercial negotiation, an emotional situation, an exception to policy, a legal or contractual matter, or a decision no documented process covers.',
  },

  exec_escalation: {
    type: 'noul',
    instructions:
      'This warrants alerting a senior leader on our side today, because a senior person on the customer side is involved or unhappy, because the account relationship itself is at stake, or because the consequence of getting it wrong is public or contractual.',
  },

  contractual_risk: {
    type: 'noul',
    instructions:
      'This message raises a contractual, legal, security or compliance obligation: an SLA that may have been breached, a data protection or privacy concern, a security questionnaire or audit, a penalty clause, a procurement or renewal paperwork requirement.',
  },

  security_or_privacy: {
    type: 'noul',
    instructions:
      'This message concerns a security incident, suspected breach, leaked credentials, unauthorised access, or the handling of personal or regulated data.',
  },

  issue_type: {
    type: 'choice',
    instructions:
      'What kind of problem or request is this, at its root? Choose by what would actually have to change to make the customer satisfied.',
    criteria: {
      defect: 'Something in the product does not work as designed: an error, a crash, wrong data, a broken integration.',
      usability: 'The product works as designed, but the customer could not find or understand how to do what they wanted.',
      missing_capability: 'The product does not do the thing being asked for at all, and would need to be built.',
      performance: 'The product works but is too slow, times out, or cannot handle the customer’s volume.',
      billing_dispute: 'A disagreement about what was charged, when, or how much.',
      process_failure: 'Our own process let them down: a missed reply, a missed meeting, a broken handover, a promise not kept.',
      information: 'A straightforward request for information, documentation or a status update.',
      account_admin: 'Users, permissions, seats, SSO, environment or workspace administration.',
    },
  },

  root_cause_area: {
    type: 'choice',
    instructions:
      'Which part of our organisation is the underlying cause of this customer’s experience, regardless of who has to reply to it? This answer is used for trend reporting, so choose the origin, not the symptom.',
    criteria: {
      product_quality: 'The software itself behaved badly: bugs, data errors, regressions, instability.',
      product_gap: 'The software is working correctly but does not cover the customer’s need.',
      documentation: 'The answer exists but the customer could not find it, or what they found was wrong or out of date.',
      onboarding_quality: 'The account was set up, configured or trained badly in the first place.',
      support_quality: 'A previous support interaction was slow, wrong, or left the issue unresolved.',
      commercial: 'Pricing, packaging, contract terms or billing mechanics are the source of the friction.',
      customer_side: 'The cause sits with the customer’s own environment, data, process or staffing.',
      none: 'No underlying failure. Ordinary use of the product or a neutral request.',
    },
  },

  churn_reason: {
    type: 'choice',
    instructions:
      'If this customer were to leave, what does this message suggest the reason would be? Answer this even when there is no sign of leaving, in which case choose the last option.',
    criteria: {
      reliability: 'They have lost trust that the product works consistently.',
      value_for_money: 'They do not believe they get enough back for what they pay.',
      missing_features: 'The product cannot do something central to their work.',
      poor_service: 'They are worn down by our responsiveness or the quality of our help.',
      competitor: 'A rival product is being evaluated or has already been chosen.',
      internal_change: 'Something changed on their side: budget cut, reorganisation, sponsor left, project cancelled.',
      low_adoption: 'Their team never really used it, so it is easy to drop.',
      not_applicable: 'Nothing in this message points towards leaving at all.',
    },
  },

  next_best_action: {
    type: 'choice',
    instructions:
      'What is the single most useful thing for our team to do next about this message? Choose the one action that most improves the outcome, assuming limited time.',
    criteria: {
      auto_acknowledge: 'Send a templated acknowledgement and route it; no judgement is required beyond that.',
      answer_directly: 'A support agent can answer this now from documented knowledge.',
      reproduce_and_file: 'Reproduce the problem and open an engineering ticket with the evidence.',
      call_the_customer: 'Pick up the phone. Writing will not settle this, or the relationship needs the contact.',
      schedule_review: 'Put a structured business or technical review in the diary with the right people.',
      involve_leadership: 'Bring a senior person in on our side before replying.',
      pass_to_sales: 'There is a commercial opportunity here that a salesperson should take.',
      apply_save_play: 'Run a retention play: understand the objection, put commercial or delivery remedies on the table.',
      close_no_action: 'No action is needed beyond recording it.',
    },
  },

  sla_breach_risk: {
    type: 'noul',
    instructions:
      'There is a stated or implied response or resolution commitment attached to this, and the message suggests it has been missed or is about to be.',
  },

  feature_request: {
    type: 'noul',
    instructions:
      'This message contains a request for functionality the product does not currently have, whether framed as a request, a wish, a complaint about an absence, or a question about the roadmap.',
  },

  onboarding_blocker: {
    type: 'noul',
    instructions:
      'This message describes something stopping an implementation, migration, integration or go-live from progressing on schedule.',
  },

  usage_decline: {
    type: 'noul',
    instructions:
      'This message indicates the customer’s team is using the product less than before, or never adopted it: dormant users, a stalled rollout, a project put on hold, or a statement that people have gone back to the old way of working.',
  },

  reference_quality_evidence: {
    type: 'noul',
    instructions:
      'This message contains a concrete, quotable result the customer attributes to the product — a number, a time saved, a cost avoided, an outcome achieved — rather than general praise.',
  },

  mentions_competitor: {
    type: 'noul',
    instructions:
      'This message names or alludes to a competing product or vendor the customer is using, evaluating, comparing us against, or being pushed towards internally.',
  },
};

/*
 * A note on what is NOT in this pack, because the omissions are the point.
 *
 * There is no `language_is_english` question, no `word_count`, no
 * `contains_an_attachment`, no `days_since_last_contact`. Those are facts, and
 * facts belong to code — a language detector, `.length`, a date subtraction —
 * which gets them right every time for nothing. Jev supplies the semantic
 * judgement an `if` statement cannot derive from prose. Asking it to count is
 * paying a model to do arithmetic badly.
 */

/* ------------------------------------------------------------------------- *
 * PACK 2 — the account rubric
 * Run over a rolled-up evidence sheet for one account: recent signals, their
 * verdicts, contract facts, onboarding progress. 14 questions, one call.
 *
 * This is the pass that replaces a health score built from arithmetic on
 * activity counts. Counting logins tells you what happened; this tells you
 * what it meant.
 * ------------------------------------------------------------------------- */

export const ACCOUNT_RUBRIC = {
  health: {
    type: 'score',
    instructions:
      'Taking all the evidence about this account together, how healthy is the relationship right now? Weigh unresolved problems, the tone of recent contact, adoption, and whether the customer is getting the outcome they bought the product for.',
    criteria: [
      'Critical. The relationship is failing: unresolved serious problems, hostile or disengaged contact, and no credible path to value.',
      'Poor. Real and accumulating problems, visible frustration, and value not being realised.',
      'Neutral. Nothing is obviously wrong and nothing is obviously working. Low signal, low engagement.',
      'Good. Working as intended, with normal friction being handled well and the customer engaged.',
      'Excellent. Getting clear value, saying so, expanding use, and advocating for the product.',
    ],
  },

  renewal_risk: {
    type: 'score',
    instructions:
      'How likely is this account to fail to renew, downgrade materially, or cancel at the next contract decision point? Base this on evidence of intent and of unmet value, not on how loudly anyone complained.',
    criteria: [
      'Very unlikely to leave. Strong adoption, positive signals, expansion interest.',
      'Unlikely. Normal relationship with no exit indicators.',
      'Uncertain. Mixed evidence, or too little contact to know.',
      'Likely. Unresolved dissatisfaction, weak adoption, or a sponsor problem.',
      'Very likely. Explicit exit language, a competitor in play, or a decision effectively already made.',
    ],
  },

  primary_risk_driver: {
    type: 'choice',
    instructions:
      'What is the single largest thing putting this account at risk? Choose the one that, if fixed, would most change the renewal outcome. If the account is not at risk, choose the last option.',
    criteria: {
      unresolved_issues: 'A backlog of problems we have not closed out.',
      poor_adoption: 'The customer’s team is not using what they bought.',
      sponsor_change: 'The person who championed us has left, changed role, or lost influence.',
      value_not_proven: 'Nobody on their side can point to what they got for the money.',
      competitor_pressure: 'An alternative is being evaluated or pushed internally.',
      commercial_pressure: 'Budget, price or contract terms are the sticking point.',
      service_fatigue: 'They are tired of how much effort dealing with us takes.',
      product_gap: 'A capability they need does not exist.',
      none: 'No material risk driver is visible in this evidence.',
    },
  },

  recommended_play: {
    type: 'choice',
    instructions:
      'What should the Customer Success team run on this account over the next two weeks? Choose the single play that best fits the evidence.',
    criteria: {
      executive_alignment: 'Get senior people on both sides in a room and re-agree what success means.',
      adoption_push: 'Structured enablement: training, workshops, use-case expansion with the day-to-day users.',
      technical_rescue: 'Put engineering effort and a named owner on the open technical problems.',
      value_review: 'Build and present the evidence of what they have got out of it so far.',
      commercial_renegotiation: 'Open the contract: repackage, reprice, or restructure the term.',
      expansion_motion: 'Bring sales in to grow the account while the conditions are good.',
      reference_request: 'Ask for the case study, review or referral while sentiment is high.',
      steady_state: 'Nothing special. Keep doing what is being done.',
      managed_exit: 'Accept the likely loss and manage the wind-down professionally.',
    },
  },

  engagement_depth: {
    type: 'score',
    instructions:
      'How deeply is this customer’s organisation engaged with us, judged by who talks to us and about what?',
    criteria: [
      'Nobody. No meaningful contact in the period covered.',
      'One person, transactionally. A single contact raising tickets only.',
      'A working team. Several day-to-day users engaged on operational matters.',
      'Cross-functional. Multiple teams and a manager-level sponsor involved.',
      'Executive. Senior leadership engaged on outcomes and strategy.',
    ],
  },

  value_realisation: {
    type: 'score',
    instructions:
      'How much of the outcome this customer bought the product for have they actually achieved, on the evidence available?',
    criteria: [
      'None. They are no further forward than before they bought.',
      'Minimal. Set up, but not yet producing anything they would call a result.',
      'Partial. Some of the intended use is working; the rest has stalled.',
      'Substantial. The main use case is delivering, with room to grow.',
      'Full. Delivering the intended outcome and being extended beyond it.',
    ],
  },

  expansion_ready: {
    type: 'noul',
    instructions:
      'The conditions for growing this account are present right now: the current use is working, sentiment is positive, and there is an identifiable next team, tier or use case to sell into.',
  },

  reference_ready: {
    type: 'noul',
    instructions:
      'This account could credibly be asked today for a public reference, case study or review, because they are getting a result they acknowledge and their recent experience with us has been good.',
  },

  needs_exec_sponsor: {
    type: 'noul',
    instructions:
      'This account needs a senior person on our side to take personal ownership, because the relationship, the contract value, or the risk of a public problem justifies it.',
  },

  onboarding_at_risk: {
    type: 'noul',
    instructions:
      'This account’s implementation or go-live is behind, blocked, or drifting in a way that threatens the date it was supposed to be live by.',
  },

  support_burden_unsustainable: {
    type: 'noul',
    instructions:
      'The volume, repetition or severity of this account’s problems is disproportionate to its value, to the point that the way it is being served needs to change.',
  },

  evidence_is_thin: {
    type: 'noul',
    instructions:
      'There is too little recent evidence about this account to judge it confidently. Silence from a customer is itself ambiguous, and this flag exists so that a confident-looking verdict built on almost nothing can be caught.',
  },

  outlook: {
    type: 'choice',
    instructions:
      'Which direction is this relationship moving, comparing the most recent evidence with the earlier evidence in the same set?',
    criteria: {
      improving: 'Recent contact is better than earlier contact: problems closing, tone lifting, use growing.',
      stable: 'No meaningful change in either direction.',
      declining: 'Recent contact is worse than earlier contact: problems accumulating, tone hardening, use shrinking.',
      volatile: 'Swinging between good and bad without settling.',
      unknown: 'Not enough recent evidence to say.',
    },
  },

  churn_within_90_days: {
    type: 'noul',
    instructions:
      'On this evidence, this account is likely to give notice, cancel, or decline to renew within the next 90 days.',
  },
};

/* ------------------------------------------------------------------------- *
 * PACK 3 — the reply QA rubric
 * Jev as a judge, on the way out rather than the way in. An LLM or an agent
 * drafts the reply; this pack decides whether it is fit to send, before a
 * customer reads it. Ten questions, ~one question's cost, on every draft.
 * ------------------------------------------------------------------------- */

export const REPLY_QA_RUBRIC = {
  answers_the_question: {
    type: 'noul',
    instructions:
      'The draft reply actually addresses what the customer asked, rather than acknowledging it, restating it, or answering an adjacent question.',
  },
  factually_supported: {
    type: 'noul',
    instructions:
      'Every factual claim in the draft — about what the product does, what was done, what will happen, dates, numbers, or entitlements — is supported by the context provided alongside it, and nothing is invented.',
  },
  makes_a_commitment: {
    type: 'noul',
    instructions:
      'The draft promises something specific: a date, a fix, a refund, a credit, an escalation, or a change to the contract. This flag exists so commitments can be reviewed before they are made, not after.',
  },
  tone_fits: {
    type: 'noul',
    instructions:
      'The tone of the draft is appropriate to the emotional state of the customer message it answers: it neither makes light of a serious problem nor over-apologises for a small one.',
  },
  acknowledges_the_frustration: {
    type: 'noul',
    instructions:
      'Where the customer expressed frustration, the draft acknowledges it directly rather than moving straight to the mechanics of the fix. If the customer expressed no frustration, this is not required and should be false.',
  },
  contains_jargon: {
    type: 'noul',
    instructions:
      'The draft uses internal vocabulary, product codenames, ticket references or acronyms that this customer has not used themselves and would not be expected to understand.',
  },
  leaks_internal_information: {
    type: 'noul',
    instructions:
      'The draft discloses something that should not leave the company: internal disagreement, another customer, an unannounced roadmap item, a security detail, or the internal cause of a failure in terms that create liability.',
  },
  legally_sensitive: {
    type: 'noul',
    instructions:
      'The draft touches something a lawyer should see first: admitting fault or breach, discussing liability or penalties, agreeing to contract changes, or responding to a formal complaint or regulatory matter.',
  },
  clarity: {
    type: 'score',
    instructions:
      'How easily will this customer understand what is being said and what happens next, reading it once?',
    criteria: [
      'Confusing. They will not know what was decided or what to do.',
      'Unclear in places. The main point is there but buried or hedged.',
      'Adequate. Understandable, if plain.',
      'Clear. The answer and the next step are both obvious on one reading.',
      'Exemplary. Clear, complete, and the next step is unmistakable.',
    ],
  },
  send_readiness: {
    type: 'choice',
    instructions:
      'Given everything about this draft — whether it answers the question, what it commits to, what it discloses and how clearly it reads — what should happen to it now, before anyone sends it?',
    criteria: {
      send_as_is: 'Fit to go to the customer unchanged.',
      minor_edit: 'Send after a small wording change; nothing substantive is wrong.',
      needs_rewrite: 'The substance is wrong, incomplete or inappropriate; write it again.',
      needs_human_review: 'A person with authority must read this before it goes, because of what it commits to or admits.',
      do_not_send: 'Sending this would make the situation worse.',
    },
  },
};

/** Every pack, addressable by name. */
export const RUBRICS = {
  signal: SIGNAL_RUBRIC,
  account: ACCOUNT_RUBRIC,
  reply_qa: REPLY_QA_RUBRIC,
};

/**
 * Pick a subset of a pack. Useful when a caller wants the cheap five rather
 * than the full twenty-two — though on Jev's pricing, there is rarely a reason.
 */
export function subset(rubric, ids) {
  return Object.fromEntries(ids.filter((id) => id in rubric).map((id) => [id, rubric[id]]));
}

export function questionCount(rubric) {
  return Object.keys(rubric).length;
}
