# Customer CRM audit — Isale vs PioPio

Audit date: 2026-10-06. Method: authenticated black-box UI audit; no access to Isale private source code or database.

## Isale surfaces observed

- List tabs: All, Important, Recent; 50 records per page in the observed account.
- Toolbar: dynamic filter, search, CRM call, bulk select/edit, export, import, card/grid view and field settings.
- Saved filters support multiple conditions plus an independent sort tab.
- Filterable fields: customer code, name, phone, gender, email, address, DOB, important, employee, business type, sales route, avatar, last activity, tier and points.
- Quick create starts with name, phone, avatar and address; expanded form adds email, employee, gender, DOB, VIP, business type and sales route.
- Detail actions: call, message, edit points, barcode and custom field.
- Detail tabs observed: CRM timeline, information, orders, transactions, notes, visits, loan/debt, customer/collaborator pricing and discounts.
- Field settings allow reordering and per-field visibility, searchability and sortability.
- Utilities menu: activities/events, Excel import/export, contact import, call/SMS sync and duplicate detection.

## Implemented in PioPio

- Responsive enterprise data grid with sticky header/action column and mobile cards.
- Debounced global search, server pagination, status/tier/group/debt/date filters and sorting.
- Customer 360 split view with profile/tags/stats, optimistic notes timeline, orders, debt ledger and private attachments.
- Full edit fields: profile, DOB, avatar, group, status, tier, points, tags, route and important flag.
- PostgreSQL full-text/trigram indexes, normalized phone duplicate prevention, soft delete and RLS.
- Transactional debt adjustment with ledger plus income transaction for payments.
- Auto customer codes and derived lifetime spending from orders.
- Graceful compatibility fallback while migration v31 is not installed.

## Honest scope boundary

Literal 100% parity cannot be verified without Isale source/API access. Pricing rules, SMS/call sync, barcode presentation and configurable custom-field designer remain separate existing modules or future work. The delivered core covers the requested customer model, filters, interactions, orders, debt and files in the website's actual Angular/Supabase stack.
