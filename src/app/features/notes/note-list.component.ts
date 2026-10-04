import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NotesService } from '../../core/notes.service';
import { OrdenNotas } from '../../models/note.model';
import { CerrarAlSalirDirective } from '../../shared/cerrar-al-salir.directive';

@Component({
  selector: 'app-note-list',
  standalone: true,
  imports: [FormsModule, DatePipe, CerrarAlSalirDirective],
  templateUrl: './note-list.component.html',
  styleUrl: './note-list.component.css',
})
export class NoteListComponent {
  notes = inject(NotesService);

  readonly ordenes: { valor: OrdenNotas; etiqueta: string; detalle: string }[] = [
    { valor: 'editada', etiqueta: 'Fecha de edición', detalle: 'Más recientes primero' },
    { valor: 'titulo', etiqueta: 'Título', detalle: 'A-Z' },
    { valor: 'creada', etiqueta: 'Fecha de creación', detalle: 'Más recientes primero' },
  ];

  confirmandoVaciar = signal(false);
  menuOrden = signal(false);

  constructor() {
    // Una confirmación a medias no sobrevive a cambiar de vista.
    effect(() => {
      this.notes.categoriaActivaId();
      this.confirmandoVaciar.set(false);
    });
  }

  ordenar(orden: OrdenNotas): void {
    this.menuOrden.set(false);
    void this.notes.cambiarOrden(orden);
  }

  textoTotal(): string {
    const total = this.notes.notas().length;
    return total === 1 ? '1 nota' : `${total} notas`;
  }

  async vaciar(): Promise<void> {
    this.confirmandoVaciar.set(false);
    await this.notes.vaciarPapelera();
  }

  preview(contenido: string): string {
    return contenido.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim();
  }
}