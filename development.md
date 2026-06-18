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
- Added `users` table to `state.db`.
- Created background XP awarding task in `index.js`.
- Added configurable scaling, state multipliers, and static channel monitoring.
- Implemented throttled level-up notifications with percentile-based medals.
- Updated documentation and `.env.example`.
- Switched "Set User Limit" to button+modal UI.
- Implemented configurable delayed channel cleanup.
- Enhanced interaction resilience with `deferReply` and better error handling.
- Improved recovery logic to scan category and respect cleanup delay.
