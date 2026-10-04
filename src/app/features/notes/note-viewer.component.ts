import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NotesService } from '../../core/notes.service';
import { MarkdownEditorComponent } from './markdown-editor.component';
import { CerrarAlSalirDirective } from '../../shared/cerrar-al-salir.directive';

@Component({
  selector: 'app-note-viewer',
  standalone: true,
  imports: [DatePipe, MarkdownEditorComponent, CerrarAlSalirDirective],
  templateUrl: './note-viewer.component.html',
  styleUrl: './note-viewer.component.css',
})
export class NoteViewerComponent {
  notes = inject(NotesService);

  confirmandoEliminar = signal(false);
  agregandoEtiqueta = signal(false);
  confirmandoDescartar = signal(false);
  menuAbierto = signal(false);
  submenuMover = signal(false);

  private campoTitulo = viewChild<ElementRef<HTMLInputElement>>('campoTitulo');
  private campoContenido = viewChild<ElementRef<HTMLTextAreaElement>>('campoContenido');
  private campoEtiqueta = viewChild<ElementRef<HTMLInputElement>>('campoEtiqueta');

  constructor() {
    // Al cambiar de nota se descartan la confirmación y el input de etiqueta a medias.
    effect(() => {
      this.notes.notaActivaId();
      this.confirmandoEliminar.set(false);
      this.agregandoEtiqueta.set(false);
      this.cerrarMenu();
    });

    effect(() => {
      if (!this.notes.creando()) this.confirmandoDescartar.set(false);
    });

    // Al entrar en edición el foco va al contenido, o al título si la nota es nueva.
    // El editor enriquecido se enfoca solo al montarse (autofoco).
    effect(() => {
      const titulo = this.campoTitulo();
      if (!titulo) return;
      const sinTitulo = untracked(() => !this.notes.borrador()?.titulo);
      if (sinTitulo) titulo.nativeElement.focus();
      else this.campoContenido()?.nativeElement.focus();
    });

    effect(() => this.campoEtiqueta()?.nativeElement.focus());
  }

  async eliminar(): Promise<void> {
    this.confirmandoEliminar.set(false);
    await this.notes.eliminarNotaActiva();
  }

  alternarMenu(): void {
    if (this.menuAbierto()) this.cerrarMenu();
    else this.menuAbierto.set(true);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
    this.submenuMover.set(false);
  }

  mover(categoriaId: string): void {
    this.cerrarMenu();
    void this.notes.moverNotaActiva(categoriaId);
  }

  abrirEnExplorador(): void {
    this.cerrarMenu();
    void this.notes.mostrarEnExplorador();
  }

  async eliminarDefinitivamente(): Promise<void> {
    this.confirmandoEliminar.set(false);
    await this.notes.eliminarDefinitivamente();
  }

  // El atajo de «Nueva nota» o, si está deshabilitado, por qué lo está.
  pistaCrear(): string {
    if (this.notes.enFavoritos()) {
      return 'Favoritos reúne notas de varias categorías: elige una categoría para crear una nota';
    }
    if (this.notes.enPapelera()) return 'La papelera es de solo lectura: elige una categoría para crear una nota';
    return 'Nueva nota (Ctrl+N)';
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
