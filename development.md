# Development Log

## 2026-06-17
- Initialized project structure.
- Pinned dependencies: `discord.js@14.26.4`, `better-sqlite3@11.8.0`, `dotenv@16.4.7`.
- Created documentation: `design.md`.
- Planned database schema and lifecycle logic.
- Addressed review feedback: Fixed Hub join logic to prevent redundant creation on voice state changes (e.g. mute).
- Refined permissions: Removed `ManageChannels` from user overwrites to strictly enforce middleware administrative control.
