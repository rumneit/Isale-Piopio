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
