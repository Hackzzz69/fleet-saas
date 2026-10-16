# FleetDesk — Road to Enterprise SaaS

## Phase 1 — SaaS foundation ✅ (this repo)

- [x] Multi-tenant data model (orgs, members, roles) with row-level security
- [x] Auth: email/password signup, auto-provisioned personal org, owner role
- [x] Trucks, trips, fuel purchases — full CRUD per fleet
- [x] IFTA tax calculator on live DB data (2026 rates, KY/VA surcharges, deadlines, holiday flags)
- [x] Quarterly filing snapshots (immutable audit record) + filed/draft status
- [x] Marketing landing page with pricing tiers
- [x] Static hosting (GitHub Pages) + Supabase backend — zero servers

## Phase 2 — Monetization

- [ ] Stripe billing: $9/truck/mo Pro, metered by active trucks per org
- [ ] Plan enforcement: free = 1 truck cap (`orgs.plan` column is ready)
- [ ] Team invites (email invite → `org_members` row, role picker)
- [ ] Role enforcement in UI (drivers see own truck; dispatchers can't delete filings)
- [ ] PDF export of the quarterly filing (the "file with the state" button)
- [ ] Onboarding: CSV import from the old Google Sheet trip log

## Phase 3 — Fleet-grade features

- [ ] ELD / telematics import (Samsara, Motive, KeepTruckin APIs) — mileage auto-flows in
- [ ] Fuel card integrations (Comdata, EFS) — purchases auto-flow in
- [ ] Per-driver view + driver settlements hookup
- [ ] Audit log table (who changed what, when)
- [ ] API keys for orgs (REST access to their own data)
- [ ] Email/SMS reminders: filing deadlines, missing fuel logs

## Phase 4 — Enterprise

- [ ] SSO / SAML (Okta, Entra ID) via Supabase SSO
- [ ] Custom data-retention + data-residency options
- [ ] Multi-entity orgs (holding companies with child fleets)
- [ ] Dedicated support channel + SLA
- [ ] SOC 2-friendly posture: audit logs, encrypted backups, access reviews

## Moat

Built by an active driver, priced per truck instead of per "seat", and starting from the unsexy core every fleet actually dreads: IFTA quarter close. The free static dashboard (fleet-dashboard repo) stays live as the top-of-funnel free tool.
