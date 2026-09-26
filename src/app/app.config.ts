import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { NOTES_REPOSITORY } from './core/notes.repository';
import { TauriNotesRepository } from './core/tauri-notes.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    { provide: NOTES_REPOSITORY, useClass: TauriNotesRepository }
  ]
};