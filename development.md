# Development Log

## 2026-06-17
- Initialized project structure.
- Pinned dependencies: `discord.js@14.26.4`, `better-sqlite3@11.8.0`, `dotenv@16.4.7`.
- Created documentation: `design.md`.
- Planned database schema and lifecycle logic.
- Addressed review feedback: Fixed Hub join logic to prevent redundant creation on voice state changes (e.g. mute).
- Refined permissions: Removed `ManageChannels` from user overwrites to strictly enforce middleware administrative control.

## 2026-06-18
- Implemented Gamification system.

## 2026-10-11
- Updated acclimation rules in `xpManager.js`:
  - Lone channel members remain at 0% acclimation until a 2nd member joins.
  - 1 -> 2 transition requires both members to acclimate together.
  - N -> N+1 transitions preserve acclimation for existing members while new members start at 0%.
  - 2 -> 1 transition freezes remaining member's acclimation for a 7.5-minute grace period before resetting to 0% if alone.
- Updated `session_state` DB schema with `alone_timestamp`.
- Updated `design.md` with new acclimation system behavior.
- Added `users` table to `state.db`.
- Created background XP awarding task in `index.js`.
- Added configurable scaling, state multipliers, and static channel monitoring.
- Implemented throttled level-up notifications with percentile-based medals.
- Updated documentation and `.env.example`.
- Switched "Set User Limit" to button+modal UI.
- Implemented configurable delayed channel cleanup.
- Enhanced interaction resilience with `deferReply` and better error handling.
- Improved recovery logic to scan category and respect cleanup delay.
