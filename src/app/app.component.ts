import { Component, DestroyRef, inject, OnInit, viewChild } from '@angular/core';
import { NotesService } from './core/notes.service';
import { TemaService } from './core/tema.service';
import { TitlebarComponent } from './shared/titlebar.component';
import { SidebarComponent } from './features/categories/sidebar.component';
import { NoteListComponent } from './features/notes/note-list.component';
import { NoteViewerComponent } from './features/notes/note-viewer.component';
import { WelcomeComponent } from './features/welcome/welcome.component';

// Dónde se escribe el contenido de una nota: el editor enriquecido o, en su lugar, el de texto plano.
const EDITOR_DE_CONTENIDO = 'app-markdown-editor, textarea.editor';
const CAMPOS_DE_LA_NOTA = `${EDITOR_DE_CONTENIDO}, .titulo-editable`;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    TitlebarComponent,
    SidebarComponent,
    NoteListComponent,
    NoteViewerComponent,
    WelcomeComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  notes = inject(NotesService);

  private lista = viewChild<NoteListComponent>('lista');

  constructor() {
    // Con inyectarlo basta: el servicio mantiene el tema de la página al día.
    inject(TemaService);
    // En fase de captura: los atajos se atienden antes de que el editor enriquecido vea la tecla
    // (Ctrl+E es, para él, formato de código).
    document.addEventListener('keydown', this.alPulsarTecla, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', this.alPulsarTecla, true));
  }

  async ngOnInit(): Promise<void> {
    await this.notes.inicializar();
  }

  private readonly alPulsarTecla = (evento: KeyboardEvent): void => {
    if (this.notes.arranque() !== 'lista') return;
    const destino = evento.target instanceof Element ? evento.target : null;

    if (evento.key === 'Escape') {
      if (this.escapeLibre(destino)) void this.notes.salirDeEdicion();
      return;
    }
    // Con Alt no: en muchos teclados AltGr llega como Ctrl+Alt y sirve para escribir símbolos.
    if (!(evento.ctrlKey || evento.metaKey) || evento.altKey || evento.shiftKey) return;

    const escribiendo = !!destino?.closest(EDITOR_DE_CONTENIDO);
    switch (evento.key.toLowerCase()) {
      case 's':
        this.atender(evento);
        void this.notes.guardarAhora();
        break;
      case 'e':
        this.atender(evento);
        if (!evento.repeat) void this.notes.alternarEdicion();
        break;
      case 'n':
        // Mientras se escribe el contenido de una nota, crear otra o saltar al buscador sería
        // un tropiezo: ahí solo valen guardar, alternar la edición y Escape.
        if (escribiendo) return;
        this.atender(evento);
        // En Favoritos y en la papelera el servicio no crea nada.
        if (!evento.repeat) void this.notes.crearNota();
        break;
      case 'k':
        if (escribiendo) return;
        this.atender(evento);
        this.lista()?.enfocarBusqueda();
        break;
    }
  };

  private atender(evento: KeyboardEvent): void {
    evento.preventDefault();
    evento.stopPropagation();
  }

  // Escape sale de la edición salvo que ya tenga otro cometido: cerrar un menú o una
  // confirmación, o cancelar un campo que no es de la nota (buscador, etiqueta, categoría).
  private escapeLibre(destino: Element | null): boolean {
    if (!this.notes.editando()) return false;
    if (document.querySelector('.menu') || destino?.closest('.confirmar')) return false;
    const campo = destino?.closest('input, textarea, [contenteditable="true"]');
    return !campo || !!campo.closest(CAMPOS_DE_LA_NOTA);
  }
}
