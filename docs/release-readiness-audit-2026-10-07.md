# Release-readiness audit — PioPio Warehouse

Date: 2026-10-07 (Asia/Ho_Chi_Minh)  
Scope: source review, production read-only smoke, local build/unit/lint, PostgreSQL-compatible migration verification.  
Safety boundary: no write/delete/load test was performed against production data.

## Executive decision

**Not ready for an international production release yet.** The code fixes in this change remove one verified privilege-escalation path and make the three highest-risk document flows atomic. Deployment is deliberately split into compatible phases: v34 database, frontend, then v35 lockdown. Real role-based and concurrent tests against a disposable Supabase project are still required. Multi-warehouse, bin/location, lot/serial and FEFO are not implemented as full business modules and are marked not applicable rather than simulated.

## Architecture and functional map

- Angular 22 standalone + Ionic 9, hash router, Signals/RxJS.
- Supabase Auth/PostgREST/PostgreSQL/Storage; browser calls RLS-protected tables and security-definer RPCs.
- 91 declared route entries (including redirects/parameter routes), split into sales, products/inventory, customers/CRM, money, reports, settings and integrations.
- Inventory source of truth: append-only `inventory_ledger` (v27); `products.stock` is a projection updated in the same database transaction.
- Critical inventory routes inspected read-only on production: product, order, received-note, transfer, stock-check, report/stock, contact and note. Each rendered its intended page without a visible fatal state at the time checked.

## Test matrix (release-critical sample)

| Module | Screen/API | Role/scenario | Expected | Actual/evidence | Status |
|---|---|---|---|---|---|
| Auth/RBAC | profile update | staff changes own role/permissions | rejected | v34 trigger + restrictive policies; source review found prior `profile self FOR ALL` gap | Fixed; DB apply pending |
| Auth/shop | app initialization | staff assigned to a shop they do not own | assigned shop loads | `AuthService` now loads `profiles.shop_id` independently of owned shops | Fixed locally |
| Auth failure | route guard | profile request fails | fail closed | `can()` now returns false without profile; client no longer creates an owner profile | Fixed locally |
| Order | `inv_create_order` | order + lines + income | all commit or all rollback | one security-definer RPC; direct table INSERT revoked by post-deploy v35 | Fixed; DB apply pending |
| Order | same nonce replay | duplicate request | one order/one set of lines | PGlite semantic check: replay count remained 1/1 | Pass locally |
| Receipt | `inv_create_received_note` | receipt + ledger + expense + supplier debt | atomic | one RPC, row/advisory locking, idempotency key | Fixed; DB apply pending |
| Receipt | delete posted document | applied inventory/accounting | preserve audit trail | service and RLS allow deletion only for pending/cancelled | Fixed locally |
| Return | `inv_create_return_note` | return + stock + refund | atomic | one RPC, shop/product/order validation and nonce | Fixed; DB apply pending |
| Transfer | v28 RPC | create/receive | transaction + row lock; no unsafe fallback | missing RPC now stops safely instead of client stock writes | Pass by source/compile; live write not run |
| Stock count | v27 RPC | concurrent stock changes | server rebase under lock | unsafe client fallback removed | Pass by source/compile; concurrency pending |
| Product upload | Storage | bad type/oversize/cross-shop path | rejected | JPEG/PNG/WebP/AVIF, 5 MiB, full shop UUID and inventory permission | Fixed; DB apply pending |
| Search | list services | grammar characters in query | no PostgREST grammar injection | shared sanitizer + two unit cases | Pass |
| Production UI | 7 critical routes | existing owner session/read-only | correct screen/no fatal state | CUA DOM snapshots on production | Pass smoke only |
| Toolchain | lint | repository | zero errors | `npm run lint` | Pass |
| Unit | Angular/Vitest | repository | all tests pass | 7 files, 44 tests | Pass |
| Build | production | Angular compiler | successful bundle | initial 1.73 MB raw / 321.92 kB estimated transfer | Pass with warnings |
| Dependencies | runtime | npm production graph | no known advisory | `npm audit --omit=dev` | Pass (0) |
| Dependencies | development | Capacitor CLI chain | no known advisory | 3 moderate advisories remain via `xcode -> uuid`; forced fix proposes a CLI downgrade | Open P3/dev-only |
| SQL | v34 + v35 | apply twice | idempotent parse | PGlite: both phases applied twice; RPC replay semantics passed | Pass locally |

## Verified defects and disposition

### P0 — staff could self-escalate through `profiles`

The original `profile self` policy was `FOR ALL`; a staff account could update its own `role` or permission JSON, while `has_permission` trusted those values. v34 replaces the broad policy and adds a trigger that permits self-service profile edits but rejects changes to identity, shop, role or permissions unless the caller owns the shop.

### P1 — staff shop context was resolved only from owned shops

An assigned staff member normally owns no shop. The client therefore failed to load the assigned shop and could enter owner auto-provisioning. The loader now reads the RLS-visible assigned shop separately and auto-provisions only a genuine owner profile.

### P1 — partial commits in sale, receipt and return flows

These flows previously issued multiple independent requests. Failure after the first request could leave a header without lines, stock without money, or money without supplier debt. v34 implements atomic RPCs with validation, advisory locks and idempotency keys. Direct INSERT into order/order-item tables is revoked so the safe contract cannot be bypassed from the public client role.

### P1 — unsafe inventory fallbacks

When an inventory RPC was absent, the browser updated each product independently and sometimes swallowed failures. That path had no row lock or transaction and was race-prone. It now fails closed with an actionable migration error and does not mutate stock.

### P1 — product storage write scope was global to authenticated users

The old bucket policies allowed any authenticated account to upload/update/delete anywhere in the product bucket. v34 requires a full shop UUID path and the inventory permission. Bucket-side MIME and 5 MiB limits complement client validation.

### P2 — PostgREST filter grammar was interpolated from search text

Product/order/receipt/return/CRM/debt/transaction searches now neutralize grammar metacharacters and cap input length while preserving Vietnamese Unicode.

### P2/P3 — baseline lint failures

Component suffixes, lifecycle interface, strict template equality and legacy `*ngIf` errors were corrected. Lint is now clean.

## Open risks and product decisions

1. **Sales can drive stock negative by explicit v27 design.** Internal transfers reject insufficient stock, but sales intentionally allow temporary negative inventory. This is not silently changed; the product owner must decide whether international release requires a configurable “block oversell” rule.
2. **No full warehouse/location model.** Transfers have a destination string, not source/destination warehouse entities with per-location balances. Bin, lot, serial, expiry allocation, FIFO/FEFO and traceability are not implemented end to end. The product-level “serial/IMEI” flag is not a serial ledger.
3. **API tokens/integration secrets remain an incomplete subsystem.** Access is now owner-only in UI/RLS after v34, but tokens/config are still stored in retrievable form and no deployable external API verifier/Edge Function exists in this repository. Do not market this module as production external API support.
4. **Deletion semantics need a product rule.** Posted receipts are now immutable. Orders still support status cancellation/deletion behavior inherited from the app; accounting reversal policy should be specified and covered by a dedicated server RPC before broad financial use.
5. **Internationalization is Vietnamese-first.** Unicode and Vietnamese number/date rendering work in inspected flows, but there is no translation catalog, configurable locale/currency/tax jurisdiction or RTL support. Dates are not consistently modeled as business-date versus event timestamp.
6. **Accessibility is partial.** Critical pages are keyboard-capable through Ionic primitives, but production DOM still exposes generic English names such as `back`/`search text` and repeated switches without sufficiently specific names. No claim of WCAG 2.2 AA is made.
7. **Performance limits not proven.** The product list is server-paginated, but the initial JS bundle remains 1.73 MB raw and build reports large component styles plus a CommonJS `jsbarcode` optimization bailout. No safe concurrent/load test was run against production.
8. **Operational controls not verifiable from this repo.** Backup restore, point-in-time recovery, alerting, log retention, rate limits, CSP and incident response need evidence from the Supabase/Vercel project configuration.
9. The legacy `audit.mjs` uses an intentionally fake JWT and no backend mock. After fail-closed RBAC it is correctly redirected and therefore cannot be counted as a route test. A new disposable-project authenticated E2E suite is required.

## Deployment and rollback

1. Back up the Supabase database or confirm PITR before applying migrations.
2. Apply `supabase-migration-v34-release-hardening.sql`. This phase adds the RPCs and compatible RLS fixes while the old frontend remains usable.
3. Confirm v34 completes; refresh the PostgREST schema cache if the RPCs are not immediately visible. Smoke-test owner, inventory staff, sales staff and no-permission accounts on non-production data.
4. Deploy this frontend and smoke-test order, receipt, return and product-image flows.
5. Apply `supabase-migration-v35-post-deploy-lockdown.sql` immediately after the new frontend is confirmed. This removes direct order inserts, restricts posted-receipt deletion and activates shop-scoped product storage writes.
6. Do not apply v35 while the old frontend is still serving: its sequential order create and short product-image path are intentionally blocked by v35.
7. Roll back the frontend to the previous Vercel deployment only before v35. After v35, rolling back also requires restoring the compatible grants/policies; never re-enable the unsafe client stock fallback.

## Acceptance checklist

- [x] Repository structure and architecture inspected.
- [x] Critical production routes smoke-tested read-only.
- [x] Lint, unit tests and production build run.
- [x] Runtime dependency audit has zero known advisories.
- [x] v34 and v35 parse, re-run and pass local RPC idempotency semantics.
- [ ] v34 applied to production/staging Supabase.
- [ ] Owner/staff RLS matrix tested against a disposable real Supabase project.
- [ ] Concurrent sale/transfer/stock-count tests run against PostgreSQL with real triggers.
- [ ] Backup restore/PITR exercise evidenced.
- [ ] WCAG 2.2 AA manual keyboard/screen-reader pass.
- [ ] Oversell and posted-order reversal rules approved by product owner.
- [ ] Multi-warehouse/lot/serial/FEFO either implemented or explicitly excluded from product claims.
