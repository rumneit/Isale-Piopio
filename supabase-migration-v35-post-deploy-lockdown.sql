-- ============================================================================
-- PioPio v35 — Post-deploy lockdown
-- Apply ONLY AFTER the frontend containing v34 RPC clients is live.
-- Safe to re-run. The old frontend must not be served after this migration.
-- ============================================================================

-- Force all new orders through atomic inv_create_order.
revoke insert on public.orders from authenticated;
revoke insert on public.order_items from authenticated;

-- Applied receipts are immutable accounting documents. Only pending/cancelled
-- documents may be deleted; posted inventory must be corrected by a new note.
drop policy if exists "rn member delete" on public.received_notes;
drop policy if exists "rn approver delete" on public.received_notes;
drop policy if exists "rn pending delete" on public.received_notes;
create policy "rn pending delete" on public.received_notes for delete using(
  status in ('pending','cancelled') and (
    created_by=auth.uid() or public.has_permission(shop_id,'inventory_approve')
  ));

-- Product uploads must be scoped to <full-shop-uuid>/... and require inventory permission.
update storage.buckets set file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif']
where id='products';
drop policy if exists "products bucket insert" on storage.objects;
drop policy if exists "products bucket update" on storage.objects;
drop policy if exists "products bucket delete" on storage.objects;
drop policy if exists "products shop insert" on storage.objects;
drop policy if exists "products shop update" on storage.objects;
drop policy if exists "products shop delete" on storage.objects;
create policy "products shop insert" on storage.objects for insert to authenticated with check(
  bucket_id='products' and public.has_permission(nullif((storage.foldername(name))[1],'')::uuid,'inventory'));
create policy "products shop update" on storage.objects for update to authenticated using(
  bucket_id='products' and public.has_permission(nullif((storage.foldername(name))[1],'')::uuid,'inventory')) with check(
  bucket_id='products' and public.has_permission(nullif((storage.foldername(name))[1],'')::uuid,'inventory'));
create policy "products shop delete" on storage.objects for delete to authenticated using(
  bucket_id='products' and public.has_permission(nullif((storage.foldername(name))[1],'')::uuid,'inventory'));

