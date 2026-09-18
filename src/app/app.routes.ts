import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

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
  { path: 'product', loadComponent: () => import('./pages/products/products.page').then((m) => m.ProductsPage), canActivate: [authGuard] },
  { path: 'product/add', loadComponent: () => import('./pages/products/product-edit.page').then((m) => m.ProductEditPage), canActivate: [authGuard] },
  { path: 'product/:id', loadComponent: () => import('./pages/products/product-edit.page').then((m) => m.ProductEditPage), canActivate: [authGuard] },
  // Orders
  { path: 'order', loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage), canActivate: [authGuard] },
  { path: 'order/add', loadComponent: () => import('./pages/orders/order-add.page').then((m) => m.OrderAddPage), canActivate: [authGuard] },
  { path: 'order/:id', loadComponent: () => import('./pages/orders/order-detail.page').then((m) => m.OrderDetailPage), canActivate: [authGuard] },
  // Transactions (thu chi)
  { path: 'trade', loadComponent: () => import('./pages/trades/trades.page').then((m) => m.TradesPage), canActivate: [authGuard] },
  { path: 'trade/add', loadComponent: () => import('./pages/trades/trade-add.page').then((m) => m.TradeAddPage), canActivate: [authGuard] },
  // Customers
  { path: 'contact', loadComponent: () => import('./pages/customers/customers.page').then((m) => m.CustomersPage), canActivate: [authGuard] },
  { path: 'contact/add', loadComponent: () => import('./pages/customers/customer-edit.page').then((m) => m.CustomerEditPage), canActivate: [authGuard] },
  { path: 'contact/:id', loadComponent: () => import('./pages/customers/customer-edit.page').then((m) => m.CustomerEditPage), canActivate: [authGuard] },
  // Debt
  { path: 'debt', loadComponent: () => import('./pages/debt/debt.page').then((m) => m.DebtPage), canActivate: [authGuard] },
  // CRM
  { path: 'crm', loadComponent: () => import('./pages/crm/crm-list.page').then((m) => m.CrmListPage), canActivate: [authGuard] },
  { path: 'crm/add', loadComponent: () => import('./pages/crm/crm-edit.page').then((m) => m.CrmEditPage), canActivate: [authGuard] },
  { path: 'crm/:id', loadComponent: () => import('./pages/crm/crm-edit.page').then((m) => m.CrmEditPage), canActivate: [authGuard] },
  // Received notes (nhập hàng)
  { path: 'received-note', loadComponent: () => import('./pages/received-notes/received-notes.page').then((m) => m.ReceivedNotesPage), canActivate: [authGuard] },
  { path: 'received-note/add', loadComponent: () => import('./pages/received-notes/received-note-add.page').then((m) => m.ReceivedNoteAddPage), canActivate: [authGuard] },
  // Delivery
  { path: 'delivery', loadComponent: () => import('./pages/delivery/delivery.page').then((m) => m.DeliveryPage), canActivate: [authGuard] },
  // Quotes
  { path: 'quote', loadComponent: () => import('./pages/quotes/quotes.page').then((m) => m.QuotesPage), canActivate: [authGuard] },
  // Promotions
  { path: 'promotion', loadComponent: () => import('./pages/promotions/promotions.page').then((m) => m.PromotionsPage), canActivate: [authGuard] },
  { path: 'promotion/add', loadComponent: () => import('./pages/promotions/promotion-edit.page').then((m) => m.PromotionEditPage), canActivate: [authGuard] },
  { path: 'promotion/:id', loadComponent: () => import('./pages/promotions/promotion-edit.page').then((m) => m.PromotionEditPage), canActivate: [authGuard] },
  // Materials
  { path: 'material', loadComponent: () => import('./pages/materials/materials.page').then((m) => m.MaterialsPage), canActivate: [authGuard] },
  // Loyalty points
  { path: 'point', loadComponent: () => import('./pages/points/points.page').then((m) => m.PointsPage), canActivate: [authGuard] },
  // Barcode scan
  { path: 'scan', loadComponent: () => import('./pages/scan/scan.page').then((m) => m.ScanPage), canActivate: [authGuard] },
  // Notifications
  { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage), canActivate: [authGuard] },
  // Reports
  { path: 'report', loadComponent: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage), canActivate: [authGuard] },
  // Money accounts
  { path: 'money-account', loadComponent: () => import('./pages/money-accounts/money-accounts.page').then((m) => m.MoneyAccountsPage), canActivate: [authGuard] },
  // Config
  { path: 'config', loadComponent: () => import('./pages/config/config.page').then((m) => m.ConfigPage), canActivate: [authGuard] },
  // Stock check
  { path: 'stock-check', loadComponent: () => import('./pages/stock-check/stock-check.page').then((m) => m.StockCheckPage), canActivate: [authGuard] },
  // Staff
  { path: 'staff', loadComponent: () => import('./pages/staff/staff.page').then((m) => m.StaffPage), canActivate: [authGuard] },
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
    redirectTo: 'home',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: 'home' },
];
