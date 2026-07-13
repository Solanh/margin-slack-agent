# Submission Checklist

## Repository preparation

- [x] Deterministic owner-scoped demo reset command added
- [x] Full product demo seed command added
- [x] Reset preserves Slack installation and Google OAuth credentials
- [x] Reset requires exact owner confirmation and an additional production opt-in
- [x] Idempotent private Slack demo publisher added
- [x] Every prepared Slack card is visibly labeled as seeded
- [x] Static and live submission preflight commands added
- [x] Paste-ready Devpost copy added in `docs/DEVPOST_SUBMISSION.md`
- [x] Upload-ready architecture graphic added in `docs/architecture-overview.svg`
- [x] Three-minute demo script aligned with seeded scenarios
- [x] Final operational runbook added in `docs/FINAL_SUBMISSION_RUNBOOK.md`

## Product

- [ ] Agent works in the official Slack developer sandbox
- [ ] Public repository is accessible
- [ ] Raw notes persist before AI processing
- [ ] Original and organized versions are visibly distinct
- [ ] Calendar/huddle context works or limitations are disclosed
- [ ] Ambiguous context prompts the user
- [ ] Post-meeting digest works
- [ ] One pre-meeting resurfacing flow works
- [ ] Retrieval is private and user-scoped
- [ ] App Home is polished

## Reliability

- [ ] Slack retries are idempotent in the deployed sandbox
- [ ] AI failure saves verbatim note in the deployed sandbox
- [ ] Calendar failure saves standalone note in the deployed sandbox
- [ ] No note bodies appear in deployed logs
- [ ] Fresh-install test completed
- [ ] `npm run demo:prepare` completed against the final demo owner
- [ ] `npm run demo:publish` completed against the final demo owner
- [ ] `npm run preflight` has zero failures
- [ ] `npm run preflight:live` has zero failures while the final process is running
- [ ] Full demo rehearsed twice from reset state

## Documentation

- [ ] README setup checked against the final deployment
- [x] Architecture diagram source included
- [x] Data handling and privacy documented
- [x] Required environment variables documented
- [x] Known limitations documented
- [x] License included
- [ ] Screenshots or GIF included

## Video

- [ ] Under three minutes
- [ ] Shows real Slack interaction
- [ ] Explains why this is not a transcript bot
- [ ] Shows original preservation
- [ ] Shows automatic meeting context or clearly disclosed fallback
- [ ] Shows ambiguity handling
- [ ] Shows resurfacing
- [ ] Architecture appears briefly
- [ ] Seeded or prepared behavior is explicitly identified
- [ ] Audio and text are legible

## Devpost

- [ ] Correct track selected
- [ ] Public repository linked
- [ ] Demonstration video linked
- [ ] `docs/architecture-overview.svg` uploaded
- [ ] Developer sandbox URL provided
- [ ] Required judge accounts invited to the sandbox
- [ ] Required Slack technology clearly identified
- [ ] Third-party services and licenses credited
- [ ] Submission copy reviewed against deployed revision
- [ ] All bracketed placeholders removed
- [ ] Submission tested from a logged-out browser
- [ ] Submitted before the official deadline
