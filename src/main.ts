import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules, withHashLocation } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent, NoReuseRouteStrategy } from './app/app.component';
import { RECOVERY_HASH_KEY, recoveryParamsFromHash } from './app/core/utils/recovery-link';

// Supabase gắn token khôi phục mật khẩu vào URL hash; hash đó xung đột với
// hash-router của Angular. Giữ token trong sessionStorage và chuẩn hoá URL
// TRƯỚC khi router/Supabase client khởi tạo, để trang reset-password đọc lại.
(function capturePasswordRecovery() {
  const params = recoveryParamsFromHash(window.location.hash);
  if (!params) return;
  try {
    sessionStorage.setItem(RECOVERY_HASH_KEY, params);
  } catch {
    return;
  }
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search + '#/reset-password'
  );
})();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: NoReuseRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding(), withHashLocation()),
  ],
});
