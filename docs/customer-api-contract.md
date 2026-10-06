# Customer API contract (Supabase PostgREST/RPC)

PioPio uses Supabase as its production backend. These RPCs are the equivalent of the requested REST endpoints while preserving authentication and row-level security.

| Requested REST endpoint | Production RPC/table operation |
|---|---|
| `POST /customers` | `rpc/crm_create_customer` |
| `GET /customers` | `rpc/crm_list_customers` |
| `GET /customers/search?q=` | `rpc/crm_list_customers` with `p_q` |
| `PUT /customers/:id` | `rpc/crm_update_customer` |
| `DELETE /customers/:id` | `rpc/crm_soft_delete_customer` |
| `POST /customers/:id/interactions` | `rpc/crm_add_customer_interaction` |
| debt transaction | `rpc/crm_adjust_customer_debt` |

All mutations validate shop membership server-side. Phone numbers are normalized to digits; new duplicates are rejected. List parameters are allow-listed and sorting does not interpolate user SQL. Page size is capped at 100. Errors use PostgreSQL/PostgREST codes; duplicate phone uses `23505`.

Example list request body:

```json
{
  "p_shop": "shop-uuid",
  "p_q": "0909 Nguyen",
  "p_debt_min": 1,
  "p_group_id": null,
  "p_assigned_to": null,
  "p_status": "active",
  "p_tier": "gold",
  "p_created_from": "2026-01-01",
  "p_created_to": "2026-10-06",
  "p_important": null,
  "p_sort_by": "total_spending",
  "p_sort_direction": "desc",
  "p_page": 1,
  "p_page_size": 20
}
```

The canonical implementation is `supabase-migration-v31-customer-crm.sql`. Adding a parallel Express/Nest/Prisma service would duplicate authorization and transaction logic and is intentionally avoided in this repository.
