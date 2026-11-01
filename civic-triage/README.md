# Nagrik Sahayak – Transparent Civic Grievance & Infrastructure Triage

Zero-dependency Node.js (>=18) app. Run `node server.js`, then open http://localhost:3000.

## Features
- No login: choose a role (Citizen / Authority) and pick your location via India > State > District > City/Block > Locality (or type your own if unlisted). Your profile ID is kept in the browser; enter it later to return.
- Citizen: profile with ID/phone/email + pledge, local feed (circulates within 5 km), report (photo/video/audio, caption, description, address, GPS), upvote, anonymous per-issue chat, flag false posts.
- Auto severity score (category, keywords, number of media, upvotes, on-site confirmations within 500 m, age); auto-routing Local > District > State > National with SLA escalation; department mapping.
- Duplicate detection: same category within 150 m (or 500 m with similar text) merges into one report, adding photos and supporters.
- Abuse control: 3 distinct flags remove a post and notify the authority; 2 removed posts suspend the account (24h x strikes). Authority can uphold or dismiss/restore.
- Authority: jurisdiction + department queue; acknowledge / start work / resolve with after-photo. After-photos are checked (duplicate-photo and distance checks; Claude vision comparison if `ANTHROPIC_API_KEY` is set), then citizens confirm or dispute; 3 disputes reopen the issue.
- Dashboards for everyone: level-wise stats, performance score, rankings at state/district/city/locality level, department and issue-type tables.

## Notes
- No demo or seed data: every report comes from a real user submission. Delete `data/` to reset a local run.
- Optional AI: `ANTHROPIC_API_KEY` (and `CLAUDE_MODEL`) enables image severity and before/after verification. Without it a heuristic check runs and community confirmation decides.
- The hierarchy covers all states/UTs and major districts; West Bengal districts and Kharagpur localities are detailed. For anything else use "Not listed – type my own".
