import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { NotesService } from '../../core/notes.service';
import { FAVORITOS, PAPELERA } from '../../models/category.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  notes = inject(NotesService);

  readonly favoritos = FAVORITOS;
  readonly papelera = PAPELERA;

  creandoCategoria = signal(false);

  private campoCategoria = viewChild<ElementRef<HTMLInputElement>>('campoCategoria');

  constructor() {
    effect(() => {
      const campo = this.campoCategoria()?.nativeElement;
      if (!campo) return;
      campo.focus();
      campo.scrollIntoView({ block: 'nearest' });
    });
  }

  async confirmarCategoria(nombre: string): Promise<void> {
    if (!this.creandoCategoria()) return;
    if (await this.notes.crearCategoria(nombre)) this.creandoCategoria.set(false);
  }

  valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

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
