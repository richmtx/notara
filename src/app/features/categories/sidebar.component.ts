import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { NotesService } from '../../core/notes.service';
import { FAVORITOS, PAPELERA, SIN_CATEGORIA } from '../../models/category.model';

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
  readonly sinCategoria = SIN_CATEGORIA;

  creandoCategoria = signal(false);

  // Categoría cuya eliminación se está confirmando y cuántas notas contiene.
  confirmacion = signal<{ id: string; notas: number } | null>(null);
  eliminando = signal(false);

  private campoCategoria = viewChild<ElementRef<HTMLInputElement>>('campoCategoria');
  private botonCancelar = viewChild<ElementRef<HTMLButtonElement>>('botonCancelar');

  constructor() {
    // La confirmación recibe el foco en la salida que no borra nada.
    effect(() => {
      const boton = this.botonCancelar()?.nativeElement;
      if (!boton) return;
      boton.focus();
      boton.scrollIntoView({ block: 'nearest' });
    });

    effect(() => {
      const campo = this.campoCategoria()?.nativeElement;
      if (!campo) return;
      campo.focus();
      campo.scrollIntoView({ block: 'nearest' });
    });
  }

  // Antes de preguntar se mira la carpeta: la confirmación dice cuántas notas se moverían, y si
  // no se puede eliminar el servicio explica por qué y no se pregunta nada.
  async pedirEliminar(id: string): Promise<void> {
    const notas = await this.notes.consultarEliminacionCategoria(id);
    this.confirmacion.set(notas === null ? null : { id, notas });
  }

  cancelarEliminar(): void {
    if (!this.eliminando()) this.confirmacion.set(null);
  }

  async eliminar(): Promise<void> {
    const pendiente = this.confirmacion();
    if (!pendiente || this.eliminando()) return;
    this.eliminando.set(true);
    try {
      await this.notes.eliminarCategoria(pendiente.id);
    } finally {
      this.eliminando.set(false);
      this.confirmacion.set(null);
    }
  }

  pregunta(nombre: string): string {
    const notas = this.confirmacion()?.notas ?? 0;
    if (!notas) return `¿Eliminar la categoría «${nombre}»? Está vacía.`;
    return notas === 1
      ? `¿Eliminar «${nombre}»? Contiene 1 nota, que se moverá a la papelera.`
      : `¿Eliminar «${nombre}»? Contiene ${notas} notas, que se moverán a la papelera.`;
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
