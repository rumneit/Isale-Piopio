import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait until the initial session check completes
  let tries = 0;
  while (!auth.initialized() && tries < 50) {
    await new Promise((r) => setTimeout(r, 100));
    tries++;
  }

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  let tries = 0;
  while (!auth.initialized() && tries < 50) {
    await new Promise((r) => setTimeout(r, 100));
    tries++;
  }

  if (auth.isLoggedIn()) {
    return router.createUrlTree(['/home']);
  }
  return true;
};
