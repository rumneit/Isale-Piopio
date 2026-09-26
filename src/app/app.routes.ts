import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  // Products
  { path: 'product', loadComponent: () => import('./pages/products/products.page').then((m) => m.ProductsPage), canActivate: [authGuard, permissionGuard] },
  { path: 'product/add', loadComponent: () => import('./pages/products/product-edit.page').then((m) => m.ProductEditPage), canActivate: [authGuard, permissionGuard] },
  { path: 'product/detail/:id', loadComponent: () => import('./pages/products/product-detail.page').then((m) => m.ProductDetailPage), canActivate: [authGuard, permissionGuard] },
  { path: 'product/update/:id', loadComponent: () => import('./pages/products/product-edit.page').then((m) => m.ProductEditPage), canActivate: [authGuard, permissionGuard] },
  { path: 'product/:id', loadComponent: () => import('./pages/products/product-edit.page').then((m) => m.ProductEditPage), canActivate: [authGuard, permissionGuard] },
  // Orders
  { path: 'order', loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'sale', loadComponent: () => import('./pages/sale/sale.page').then((m) => m.SalePage), canActivate: [authGuard, permissionGuard] },
  { path: 'order/add', loadComponent: () => import('./pages/orders/order-add.page').then((m) => m.OrderAddPage), canActivate: [authGuard, permissionGuard] },
  { path: 'order/:id/return', loadComponent: () => import('./pages/returns/order-return.page').then((m) => m.OrderReturnPage), canActivate: [authGuard, permissionGuard] },
  { path: 'order/:id', loadComponent: () => import('./pages/orders/order-detail.page').then((m) => m.OrderDetailPage), canActivate: [authGuard, permissionGuard] },
  // Returns
  { path: 'returns', loadComponent: () => import('./pages/returns/returns.page').then((m) => m.ReturnsPage), canActivate: [authGuard, permissionGuard] },
  // Transactions (thu chi)
  { path: 'trade', loadComponent: () => import('./pages/trades/trades.page').then((m) => m.TradesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'trade/add', loadComponent: () => import('./pages/trades/trade-add.page').then((m) => m.TradeAddPage), canActivate: [authGuard, permissionGuard] },
  // Customers
  { path: 'contact', loadComponent: () => import('./pages/customers/customers.page').then((m) => m.CustomersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'contact/add', loadComponent: () => import('./pages/customers/customer-edit.page').then((m) => m.CustomerEditPage), canActivate: [authGuard, permissionGuard] },
  { path: 'contact/detail/:id', loadComponent: () => import('./pages/customers/customer-detail.page').then((m) => m.CustomerDetailPage), canActivate: [authGuard, permissionGuard] },
  { path: 'contact/filter-duplicate', loadComponent: () => import('./pages/customers/duplicate-customers.page').then((m) => m.DuplicateCustomersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'contact/:id', loadComponent: () => import('./pages/customers/customer-edit.page').then((m) => m.CustomerEditPage), canActivate: [authGuard, permissionGuard] },
  // Debt
  { path: 'debt', loadComponent: () => import('./pages/debt/debt.page').then((m) => m.DebtPage), canActivate: [authGuard, permissionGuard] },
  { path: 'online-order', loadComponent: () => import('./pages/online-order/online-order.page').then((m) => m.OnlineOrderPage), canActivate: [authGuard, permissionGuard] },
  // CRM
  { path: 'crm', loadComponent: () => import('./pages/crm/crm-list.page').then((m) => m.CrmListPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/pipeline', loadComponent: () => import('./pages/crm/crm-pipeline.page').then((m) => m.CrmPipelinePage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/deals', loadComponent: () => import('./pages/crm/crm-deals.page').then((m) => m.CrmDealsPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/forecast', loadComponent: () => import('./pages/crm/crm-forecast.page').then((m) => m.CrmForecastPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/quota', loadComponent: () => import('./pages/crm/crm-quota.page').then((m) => m.CrmQuotaPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/approvals', loadComponent: () => import('./pages/crm/crm-approvals.page').then((m) => m.CrmApprovalsPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/add', loadComponent: () => import('./pages/crm/crm-edit.page').then((m) => m.CrmEditPage), canActivate: [authGuard, permissionGuard] },
  { path: 'crm/:id', loadComponent: () => import('./pages/crm/crm-edit.page').then((m) => m.CrmEditPage), canActivate: [authGuard, permissionGuard] },
  // Tuyến & kênh bán hàng
  { path: 'sales-route', loadComponent: () => import('./pages/sales-routes/sales-routes.page').then((m) => m.SalesRoutesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'sales-channels', loadComponent: () => import('./pages/sales-channels/sales-channels.page').then((m) => m.SalesChannelsPage), canActivate: [authGuard, permissionGuard] },
  // Activity log + permissions
  { path: 'activity-log', loadComponent: () => import('./pages/activity-log/activity-log.page').then((m) => m.ActivityLogPage), canActivate: [authGuard, permissionGuard] },
  { path: 'permission', loadComponent: () => import('./pages/permissions/permissions.page').then((m) => m.PermissionsPage), canActivate: [authGuard] },
  // Received notes (nhập hàng)
  { path: 'received-note', loadComponent: () => import('./pages/received-notes/received-notes.page').then((m) => m.ReceivedNotesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'received-note/add', loadComponent: () => import('./pages/received-notes/received-note-add.page').then((m) => m.ReceivedNoteAddPage), canActivate: [authGuard, permissionGuard] },
  // Delivery
  { path: 'delivery', loadComponent: () => import('./pages/delivery/delivery.page').then((m) => m.DeliveryPage), canActivate: [authGuard, permissionGuard] },
  // Quotes
  { path: 'quote', loadComponent: () => import('./pages/quotes/quotes.page').then((m) => m.QuotesPage), canActivate: [authGuard, permissionGuard] },
  // Promotions
  { path: 'promotion', loadComponent: () => import('./pages/promotions/promotions.page').then((m) => m.PromotionsPage), canActivate: [authGuard, permissionGuard] },
  { path: 'promotion/add', loadComponent: () => import('./pages/promotions/promotion-edit.page').then((m) => m.PromotionEditPage), canActivate: [authGuard, permissionGuard] },
  { path: 'promotion/:id', loadComponent: () => import('./pages/promotions/promotion-edit.page').then((m) => m.PromotionEditPage), canActivate: [authGuard, permissionGuard] },
  // Materials
  { path: 'material', loadComponent: () => import('./pages/materials/materials.page').then((m) => m.MaterialsPage), canActivate: [authGuard, permissionGuard] },
  // Loyalty points
  { path: 'point', loadComponent: () => import('./pages/points/points.page').then((m) => m.PointsPage), canActivate: [authGuard, permissionGuard] },
  // Barcode scan
  { path: 'scan', loadComponent: () => import('./pages/scan/scan.page').then((m) => m.ScanPage), canActivate: [authGuard, permissionGuard] },
  // Extended modules (đợt A)
  { path: 'calendar', loadComponent: () => import('./pages/calendar/calendar.page').then((m) => m.CalendarPage), canActivate: [authGuard, permissionGuard] },
  { path: 'note', loadComponent: () => import('./pages/notes/notes.page').then((m) => m.NotesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'shift', loadComponent: () => import('./pages/shift/shift.page').then((m) => m.ShiftPage), canActivate: [authGuard] },
  { path: 'transfer', loadComponent: () => import('./pages/transfers/transfers.page').then((m) => m.TransfersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'transfer/add', loadComponent: () => import('./pages/transfers/transfer-add.page').then((m) => m.TransferAddPage), canActivate: [authGuard, permissionGuard] },
  { path: 'cafe-tables', loadComponent: () => import('./pages/cafe-tables/cafe-tables.page').then((m) => m.CafeTablesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'import', loadComponent: () => import('./pages/import/import.page').then((m) => m.ImportPage), canActivate: [authGuard, permissionGuard] },
  // Extended modules (đợt B)
  { path: 'crm-activities', loadComponent: () => import('./pages/crm/crm-activities.page').then((m) => m.CrmActivitiesPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/product', loadComponent: () => import('./pages/reports/report-product.page').then((m) => m.ReportProductPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/debt', loadComponent: () => import('./pages/reports/report-debt.page').then((m) => m.ReportDebtPage), canActivate: [authGuard, permissionGuard] },
  { path: 'integrations', loadComponent: () => import('./pages/integrations/integrations.page').then((m) => m.IntegrationsPage), canActivate: [authGuard] },
  { path: 'support', loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage), canActivate: [authGuard] },
  { path: 'org-chart', loadComponent: () => import('./pages/org-chart/org-chart.page').then((m) => m.OrgChartPage), canActivate: [authGuard] },
  // Notifications
  { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage), canActivate: [authGuard] },
  // Reports
  { path: 'report', loadComponent: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/chart', loadComponent: () => import('./pages/reports/report-chart.page').then((m) => m.ReportChartPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/orders', loadComponent: () => import('./pages/reports/report-orders.page').then((m) => m.ReportOrdersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/customer', loadComponent: () => import('./pages/reports/report-customer.page').then((m) => m.ReportCustomerPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/stock', loadComponent: () => import('./pages/reports/report-stock.page').then((m) => m.ReportStockPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/inout', loadComponent: () => import('./pages/reports/report-inout.page').then((m) => m.ReportInOutPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/category', loadComponent: () => import('./pages/reports/report-category.page').then((m) => m.ReportCategoryPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/timely', loadComponent: () => import('./pages/reports/report-timely.page').then((m) => m.ReportTimelyPage), canActivate: [authGuard, permissionGuard] },
  { path: 'report/excel', loadComponent: () => import('./pages/reports/report-excel.page').then((m) => m.ReportExcelPage), canActivate: [authGuard, permissionGuard] },
  // Money accounts
  { path: 'money-account', loadComponent: () => import('./pages/money-accounts/money-accounts.page').then((m) => m.MoneyAccountsPage), canActivate: [authGuard, permissionGuard] },
  // Config
  { path: 'config', loadComponent: () => import('./pages/config/config.page').then((m) => m.ConfigPage), canActivate: [authGuard] },
  { path: 'change-password', loadComponent: () => import('./pages/config/change-password.page').then((m) => m.ChangePasswordPage), canActivate: [authGuard] },
  { path: 'custom-field', loadComponent: () => import('./pages/config/custom-fields.page').then((m) => m.CustomFieldsPage), canActivate: [authGuard] },
  // Bảng dữ liệu tùy chỉnh
  { path: 'custom-table', loadComponent: () => import('./pages/custom-tables/custom-tables.page').then((m) => m.CustomTablesPage), canActivate: [authGuard] },
  { path: 'custom-table/:id', loadComponent: () => import('./pages/custom-tables/custom-table-detail.page').then((m) => m.CustomTableDetailPage), canActivate: [authGuard] },
  // Tích hợp theo nhà cung cấp
  { path: 'fbpage', loadComponent: () => import('./pages/integrations/integration-config.page').then((m) => m.IntegrationConfigPage), canActivate: [authGuard], data: { provider: 'fbpage' } },
  { path: 'zbs-marketing', loadComponent: () => import('./pages/integrations/integration-config.page').then((m) => m.IntegrationConfigPage), canActivate: [authGuard], data: { provider: 'zbs' } },
  { path: 'sms-marketing', loadComponent: () => import('./pages/integrations/integration-config.page').then((m) => m.IntegrationConfigPage), canActivate: [authGuard], data: { provider: 'sms' } },
  { path: 'sepay-payment', loadComponent: () => import('./pages/integrations/integration-config.page').then((m) => m.IntegrationConfigPage), canActivate: [authGuard], data: { provider: 'sepay' } },
  { path: 'ai-services', loadComponent: () => import('./pages/integrations/integration-config.page').then((m) => m.IntegrationConfigPage), canActivate: [authGuard], data: { provider: 'ai' } },
  { path: 'external-api', loadComponent: () => import('./pages/external-api/external-api.page').then((m) => m.ExternalApiPage), canActivate: [authGuard] },
  { path: 'pricing', loadComponent: () => import('./pages/pricing/pricing.page').then((m) => m.PricingPage), canActivate: [authGuard] },
  { path: 'request-pro', loadComponent: () => import('./pages/pricing/pricing.page').then((m) => m.PricingPage), canActivate: [authGuard] },
  // Stock check
  { path: 'stock-check', loadComponent: () => import('./pages/stock-check/stock-check.page').then((m) => m.StockCheckPage), canActivate: [authGuard, permissionGuard] },
  { path: 'stock-check/new', loadComponent: () => import('./pages/stock-check/stock-count-detail.page').then((m) => m.StockCountDetailPage), canActivate: [authGuard, permissionGuard] },
  { path: 'stock-check/:id', loadComponent: () => import('./pages/stock-check/stock-count-detail.page').then((m) => m.StockCountDetailPage), canActivate: [authGuard, permissionGuard] },
  // Staff
  { path: 'staff', loadComponent: () => import('./pages/staff/staff.page').then((m) => m.StaffPage), canActivate: [authGuard] },
  // Đợt 3 — module còn lại sau audit
  { path: 'shipping-partners', loadComponent: () => import('./pages/shipping-partners/shipping-partners.page').then((m) => m.ShippingPartnersPage), canActivate: [authGuard, permissionGuard] },
  { path: 'point-config', loadComponent: () => import('./pages/point-config/point-config.page').then((m) => m.PointConfigPage), canActivate: [authGuard, permissionGuard] },
  { path: 'level-config', loadComponent: () => import('./pages/level-config/level-config.page').then((m) => m.LevelConfigPage), canActivate: [authGuard, permissionGuard] },
  { path: 'ai-dynamic-page', loadComponent: () => import('./pages/ai-dynamic-page/ai-dynamic-page.page').then((m) => m.AiDynamicPage), canActivate: [authGuard, permissionGuard] },
  { path: 'ai-page/:id', loadComponent: () => import('./pages/ai-dynamic-page/ai-page-detail.page').then((m) => m.AiPageDetailPage), canActivate: [authGuard, permissionGuard] },
  { path: 'cyberlotus-tax', loadComponent: () => import('./pages/cyberlotus-tax/cyberlotus-tax.page').then((m) => m.CyberlotusTaxPage), canActivate: [authGuard, permissionGuard] },
  // Help
  { path: 'help', loadComponent: () => import('./pages/help/help.page').then((m) => m.HelpPage), canActivate: [authGuard] },
  // Placeholder for future modules
  {
    path: 'module/:id',
    loadComponent: () => import('./pages/coming-soon/coming-soon.page').then((m) => m.ComingSoonPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'sale',
    pathMatch: 'full',
  },
  // 404 thật: URL lạ hiển thị trang "Không tìm thấy trang" thay vì redirect êm về /home
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
