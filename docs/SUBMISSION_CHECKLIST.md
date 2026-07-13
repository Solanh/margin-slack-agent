# Submission Checklist

## Repository preparation

- [x] Deterministic owner-scoped demo reset command added
- [x] Full product demo seed command added
- [x] Reset preserves Slack installation and Google OAuth credentials
- [x] Reset requires exact owner confirmation and an additional production opt-in
- [x] Paste-ready Devpost copy added in `docs/DEVPOST_SUBMISSION.md`
- [x] Upload-ready architecture graphic added in `docs/architecture-overview.svg`
- [x] Three-minute demo script aligned with seeded scenarios

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

- [ ] Slack retries are idempotent
- [ ] AI failure saves verbatim note
- [ ] Calendar failure saves standalone note
- [ ] No note bodies in logs
- [ ] Fresh-install test completed
- [ ] `npm run demo:prepare` completed against the final demo owner
- [ ] Full demo rehearsed twice from reset state

## Documentation

- [ ] README setup is accurate
- [x] Architecture diagram source included
- [ ] Data handling and privacy documented
- [ ] Required environment variables documented
- [ ] Known limitations documented
- [ ] License included
- [ ] Screenshots or GIF included

## Video

- [ ] Under three minutes
- [ ] Shows real Slack interaction
- [ ] Explains why this is not a transcript bot
- [ ] Shows original preservation
- [ ] Shows automatic meeting context
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
- [ ] Submission tested from a logged-out browser
- [ ] Submitted before the official deadline
