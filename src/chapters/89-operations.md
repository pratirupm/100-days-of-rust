---
title: Operations
day: 89
part: Production ground
partDay: 29
partDays: 30
time: "2 hours"
description: Run the service on a schedule: SLOs, on-call, backups, capacity, and the boring work that keeps it alive.
bullets:
  - write the on-call runbook;
  - schedule backups and restore drills;
  - track capacity and cost before they surprise you.
---

Features get attention. Operations keeps them working: the deploy, the backup,
the certificate, the disk, the alert that nobody owns.

Today the app gets an operations checklist.

## The runbook

`deploy/RUNBOOK.md` already covers deploy, health, backup, restore, rotate, and
rollback. Add the incident entry points:

- who is on call;
- how to reach them;
- the dashboards and the logs;
- the status page;
- the escalation path.

A runbook that lives only in someone's head is a single point of failure.

## SLOs and alerts

The service has one SLO: successful task requests within the latency target.
The alert fires on the burn rate, not on a single error. The dashboard links to
the runbook.

Review the alerts monthly. An alert that never fires may be broken; one that
fires daily is ignored. Both are worse than no alert.

## Backups

- **Daily** database snapshot.
- **Weekly** restore into a scratch environment.
- **Monthly** copy to a second location.
- **Before every migration** a manual snapshot.

The backup is encrypted and access-controlled. A backup with the same
credentials as the production database is stolen along with it.

## Capacity

Track:

- database size and growth per month;
- request rate and p99;
- queue depth and lag;
- disk and connection-pool saturation;
- certificate expiry.

A disk that fills in 30 days is a date on the calendar, not a surprise. Set a
threshold and a ticket.

## Cost

The cloud bill is a production metric. The app's smallest deployment:

- one small VM or a Kubernetes namespace;
- one managed Postgres instance;
- object storage for backups;
- a container registry;
- a log/metrics bill that often exceeds the compute.

Set a budget alert. The free tier is a trial, not an architecture.

## Maintenance

- **Dependencies:** the security workflow runs on a schedule; merge the fixes.
- **Toolchain:** pin it; upgrade on purpose, then rerun the check.
- **Certificates:** Caddy renews; monitor the expiry anyway.
- **Database migrations:** forward-only, backed up, tested on a copy.
- **Runbooks:** update after every incident; a stale runbook is a trap.

## In the app

The health endpoint, the metrics, the logs, and the runbook are the operational
surface. The app does not need a new feature for operations; it needs the
habits around it.

The local Podman lab and the production deployment share the same image and
environment contract. The difference is the schedule and the owner.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 89: operations"
```

## If something went wrong

**The disk fills.** Logs, database growth, or a backup copy. Set retention and
alert at 80%.

**The certificate expires.** The renewal failed silently. Monitor the expiry
date, not just the HTTPS response.

**The backup job stops.** A timer or a CronJob failed and nobody noticed. Alert
on the last successful backup age.

**The on-call is exhausted.** The alert volume is too high or the system is
unstable. Fix the noise, then the rotation.

**The cost spikes.** A runaway queue, log volume, or egress. Set a budget alert
and a rate limit.

**The runbook is wrong.** Update it during the incident, not after. A wrong step
costs minutes.

## Going deeper: reliability is a budget

Every nine of availability costs engineering and money. A 99.9% service is
allowed about 43 minutes of downtime a month; a 99.99% service is allowed four.
Decide the target with the product, then spend the budget deliberately.

The app's course-scale target is modest. The habits — backups, alerts, a
runbook, a restore drill — transfer to any target.

The last production lesson is the capstone: run the whole stack and check the
list.

