import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NotesService } from '../../core/notes.service';

@Component({
  selector: 'app-note-viewer',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './note-viewer.component.html',
  styleUrl: './note-viewer.component.css',
})
export class NoteViewerComponent {
  notes = inject(NotesService);

  confirmandoEliminar = signal(false);
  agregandoEtiqueta = signal(false);
  confirmandoDescartar = signal(false);

  private campoTitulo = viewChild<ElementRef<HTMLInputElement>>('campoTitulo');
  private campoContenido = viewChild<ElementRef<HTMLTextAreaElement>>('campoContenido');
  private campoEtiqueta = viewChild<ElementRef<HTMLInputElement>>('campoEtiqueta');

  constructor() {
    // Al cambiar de nota se descartan la confirmación y el input de etiqueta a medias.
    effect(() => {
      this.notes.notaActivaId();
      this.confirmandoEliminar.set(false);
      this.agregandoEtiqueta.set(false);
    });

    effect(() => {
      if (!this.notes.creando()) this.confirmandoDescartar.set(false);
    });

    // Al entrar en edición el foco va al contenido, o al título si la nota es nueva.
    effect(() => {
      const titulo = this.campoTitulo();
      const contenido = this.campoContenido();
      if (!titulo || !contenido) return;
      const sinTitulo = untracked(() => !this.notes.borrador()?.titulo);
      (sinTitulo ? titulo : contenido).nativeElement.focus();
    });

    effect(() => this.campoEtiqueta()?.nativeElement.focus());
  }

  alternarEdicion(): void {
    if (this.notes.editando()) {
      void this.notes.salirDeEdicion();
    } else {
      this.notes.editar();
    }
  }

  async eliminar(): Promise<void> {
    this.confirmandoEliminar.set(false);
    await this.notes.eliminarNotaActiva();
  }

  // Cancelar una nota recién creada: solo se confirma si ya hay algo escrito que perder.
  cancelarCreacion(): void {
    const borrador = this.notes.borrador();
    if (borrador?.titulo.trim() || borrador?.contenido.trim()) {
      this.confirmandoDescartar.set(true);
    } else {
      void this.notes.cancelarCreacion();
    }
  }

  descartar(): void {
    this.confirmandoDescartar.set(false);
    void this.notes.cancelarCreacion();
  }

  confirmarEtiqueta(valor: string): void {
    if (!this.agregandoEtiqueta()) return;
    this.agregandoEtiqueta.set(false);
    if (valor.trim()) void this.notes.agregarEtiqueta(valor);
  }

  valor(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
