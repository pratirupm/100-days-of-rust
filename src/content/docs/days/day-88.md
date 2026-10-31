---
title: "Day 88 — Security incidents"
description: "Detect, contain, eradicate, and learn — a small incident runbook for a leaked token or a vulnerable dependency. — Day 88 of 100 Days of Rust."
sidebar:
  hidden: true
day: 88
---

**About 2 hours** · Production ground, day 28 of 30.

**You'll be able to:**

- rotate first, investigate second;
- preserve evidence without preserving access;
- write a blameless postmortem.

---

A vulnerability scanner finds a dependency. A log shows a token in a URL. A
user reports an email they did not request. An incident is not a hypothetical;
it is a Tuesday.

This lesson is the runbook for the two incidents the app can actually have: a
leaked credential and a vulnerable dependency.

## Detect

- the secret scanner finds a token in history;
- the advisory database flags a crate;
- the auth logs show a login from a new country;
- a user reports a change they did not make;
- the dependency's maintainer announces a compromise.

Detection is the hard part. The app's audit pipeline (SBOM, advisories, secret
scan) is the tripwire.

## Contain

For a leaked token:

1. **revoke the token** — delete the session row, rotate the secret;
2. **stop the bleeding** — disable the account or the endpoint if needed;
3. **preserve evidence** — logs, request ids, the affected rows;
4. **notify** — the owner, and the users if their data was exposed.

Rotating first is deliberate. Investigating with a live credential leaves the
attacker in place. Keep the old value in a sealed note for the timeline; do not
keep it usable.

For a vulnerable dependency:

1. identify the affected versions and the reachable code path;
2. upgrade, patch, or remove;
3. if no fix exists, add a compensating control (input validation, feature
   flag, network policy);
4. rebuild and redeploy from a clean environment.

## Eradicate

A leaked token is rotated; a vulnerable crate is upgraded. Then check for the
same class of problem elsewhere:

- other tokens in logs, URLs, or history;
- other crates with the same advisory;
- the deploy pipeline that allowed the secret in.

A fix that only removes the symptom leaves the cause.

## Recover

Restore service, verify the health and the data, and watch the error rate. A
rollback that crosses a migration needs the pre-deploy backup.

Communicate the recovery in the same channel as the incident. Silence after a
fix is its own problem.

## Postmortem

A blameless postmortem answers:

- what happened, in a timeline;
- what the user impact was;
- what went well;
- what went poorly;
- what changes prevent a repeat, with owners and dates.

"The engineer was careless" is not an action item. "The CI did not scan for
secrets in history; add a scanner and a pre-commit hook" is.

## In the app

The session table makes revocation easy: delete the row, the token is dead. The
`Secret` type makes logging less likely. The secret scan and the advisory check
are the tripwires. The runbook is in `SECURITY.md` and `deploy/RUNBOOK.md`.

The incident process is not code, but it is part of the product. A fast rotate
and a clear message are worth more than a perfect root-cause analysis in the
first hour.

## If something went wrong

**The token is still valid after rotation.** A second copy exists: a cookie, a
cache, a log, another session row. Revoke all sessions for the user.

**The vulnerable crate is a build dependency.** It still runs on the build
machine and can steal secrets. Patch it or isolate the build.

**The rollback restores the vulnerability.** The old binary is vulnerable.
Roll forward with the fix; the rollback is for availability, not security.

**The postmortem becomes a blame session.** Remove names, focus on systems.
People stop reporting incidents when the report hurts them.

**The incident channel goes silent.** Assign a communications owner and post
updates on a schedule, even when there is no update.

**The same incident happens again.** The action items had no owner or date. A
postmortem without follow-through is a story.

## Going deeper: tabletop exercises

Once a quarter, walk through a scenario without a real incident: "the database
is gone", "the signing key leaked", "a dependency is compromised". Time the
detection and the rotation. The gaps are the plan.

The app's scale is small; the habits are the same at any scale. Rotate, contain,
communicate, learn.

The final production lesson is the capstone: run the whole stack and check the
list.

<div class="day-tracker" data-day="88"></div>
