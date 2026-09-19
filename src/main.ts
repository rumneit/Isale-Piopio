import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules, withHashLocation } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent, NoReuseRouteStrategy } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: NoReuseRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding(), withHashLocation()),
  ],
});
