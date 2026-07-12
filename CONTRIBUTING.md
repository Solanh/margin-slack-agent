# Contributing

## Product constraints

Contributions should preserve Margin's core principles:

- private by default;
- user-selected capture;
- immutable original note;
- explicit provenance and uncertainty;
- no meeting recording;
- no silent action on behalf of the user.

## Development workflow

1. Create a focused branch.
2. Add or update tests.
3. Keep Slack event handling idempotent.
4. Do not log raw note content.
5. Document new scopes and data access.
6. Update the decision log for material product changes.

## Definition of done

A feature is complete when:

- behavior is tested;
- failure mode is defined;
- privacy impact is documented;
- UI distinguishes facts from inference;
- setup documentation is updated.
