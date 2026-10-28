# RELEASE GATE — GO / NO-GO

**Cập nhật:** 2026-10-29

**Phiên bản:** `main` tại `7258d4f` + probe documentation hiện tại

**Quyết định:** **NO-GO**

Automated regression và production public smoke đều xanh, nhưng chưa đủ bằng chứng để phát hành theo chuẩn enterprise. Không được suy diễn “test hiện có pass” thành “không còn lỗi”.

## Trạng thái điều kiện phát hành

| Điều kiện | Trạng thái | Bằng chứng / khoảng trống |
|---|---|---|
| Không còn P0 đã xác nhận | ĐẠT trong phạm vi đã test | Không phát hiện P0 mở; coverage thấp nên không chứng minh P0 không tồn tại ngoài phạm vi. |
| Không còn P1 release-blocking | KHÔNG ĐẠT | Metadata đơn vị và plaintext secret đã xử lý; coverage, backup/restore và production concurrency vẫn thiếu bằng chứng. |
| Build và regression | ĐẠT | GitHub Quality Gate `40684613433` success; local 79 unit, 46 SQL, 24 E2E. |
| Production public smoke | ĐẠT | 7/7 sau deploy; login, guard, reset và 404 không lỗi console. |
| Schema production | ĐẠT | Probe 12/12 xác nhận v43-v48; v46/v47/v48 đã introspect bằng SQL Editor. |
| Cross-browser | ĐẠT MỘT PHẦN | 89/89 route trên Chromium/Firefox/WebKit với tenant rỗng mock; chưa phải CRUD dữ liệu thật. |
| Accessibility | ĐẠT MỘT PHẦN | Axe 0 violation trên 7 route lõi × 3 engine; chưa screen reader/zoom/device thật. |
| Coverage | KHÔNG ĐẠT | Line 3,95%; statements 4,04%; functions 3,47%. |
| Performance | KHÔNG ĐẠT | Lighthouse public login 74; LCP 3,0 s; TBT 470 ms; chưa load/API percentile. |
| CI enforcement | KHÔNG ĐẠT | Workflow có và đã pass, nhưng GitHub API xác nhận `main` chưa protected, không có ruleset. |
| Backup/restore/monitoring | KHÔNG ĐẠT | Project Free không có scheduled backup/PITR; chưa thể restore drill, alert, rollback rehearsal. |

## Bằng chứng hiện tại

- Production: Vercel deployment `dpl_1bJ9DVwGhbgb4JKzTYCScScGiuAs` `READY`, alias chính hoạt động.
- Headers: HSTS, `nosniff`, frame deny, referrer và permissions policy đã xác nhận trên production.
- Dependency audit: 4 moderate, 0 high, 0 critical; không dùng `--force` để tránh đổi major mù quáng.
- Probe production: v43-v48 đều `APPLIED`; 29/29 order item có metadata hợp lệ; token/integration hiện có 0 bản ghi trước hardening.

## Điều kiện tối thiểu để re-gate

1. Nâng gói hoặc thiết lập backup ngoài Supabase để có backup/PITR và restore drill trên project staging.
2. Bật branch protection/deploy dependency cho Quality Gate.
3. Tăng coverage cho tiền, tồn kho, công nợ và tenant isolation; chạy concurrency bằng hai kết nối trên staging.
4. Thiết lập monitoring/alert và rollback runbook có bằng chứng.

Chi tiết đầy đủ nằm trong `PIOPIO_GLOBAL_AUDIT_REPORT.md` ở thư mục deliverable của phiên kiểm toán. Không ký GO trước khi các điều kiện trên được xử lý hoặc có quyết định chấp nhận rủi ro bằng văn bản.
