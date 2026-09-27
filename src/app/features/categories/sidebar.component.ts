import { Component, inject } from '@angular/core';
import { NotesService } from '../../core/notes.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  notes = inject(NotesService);

  icono(nombre: string): string {
    const mapa: Record<string, string> = {
      folder: 'ti-folder',
      inbox: 'ti-inbox',
      briefcase: 'ti-briefcase',
      cloud: 'ti-cloud',
      code: 'ti-code',
      user: 'ti-user',
    };
    return mapa[nombre] ?? 'ti-folder';
  }
}