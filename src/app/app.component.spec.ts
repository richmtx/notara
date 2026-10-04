import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { MockNotesRepository } from './core/mock-notes.repository';
import { NOTES_REPOSITORY } from './core/notes.repository';
import { NotesService } from './core/notes.service';
import { SettingsService } from './core/settings.service';
import { FAVORITOS, PAPELERA } from './models/category.model';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let settings: SettingsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    }).compileComponents();

    // Los ajustes se leen con un plugin de Tauri, que no existe en el navegador de pruebas.
    settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    fixture = TestBed.createComponent(AppComponent);
  });

  const elemento = () => fixture.nativeElement as HTMLElement;

  async function arrancar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('se crea correctamente', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('inicializa el NotesService al arrancar', async () => {
    const inicializar = spyOn(TestBed.inject(NotesService), 'inicializar').and.callThrough();
    await arrancar();
    expect(inicializar).toHaveBeenCalledTimes(1);
    expect(settings.cargar).toHaveBeenCalled();
  });

  it('no muestra la bienvenida mientras se leen los ajustes', async () => {
    let terminarCarga!: () => void;
    const carga = new Promise<void>((resolve) => (terminarCarga = resolve));
    (settings.cargar as jasmine.Spy).and.returnValue(carga);

    fixture.detectChanges();
    expect(elemento().querySelector('app-welcome')).toBeNull();
    expect(elemento().querySelector('.layout')).toBeNull();
    expect(elemento().querySelector('.arranque')).not.toBeNull();

    terminarCarga();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(elemento().querySelector('.arranque')).toBeNull();
    expect(elemento().querySelector('app-welcome')).not.toBeNull();
  });

  it('mantiene la barra de título en todas las pantallas', async () => {
    fixture.detectChanges();
    expect(elemento().querySelector('.arranque')).not.toBeNull();
    expect(elemento().querySelector('app-titlebar')).not.toBeNull();

    await arrancar();
    expect(elemento().querySelector('app-welcome')).not.toBeNull();
    expect(elemento().querySelector('app-titlebar')).not.toBeNull();
    expect(elemento().querySelectorAll('app-titlebar button').length).toBe(3);
  });

  it('muestra la bienvenida cuando no hay carpeta raíz configurada', async () => {
    await arrancar();
    expect(elemento().querySelector('app-welcome')).not.toBeNull();
    expect(elemento().querySelector('.layout')).toBeNull();
  });

  describe('atajos de teclado', () => {
    let notes: NotesService;

    // La tecla sale del elemento que tenga el foco, como en el navegador.
    async function pulsar(key: string, ctrlKey = true, desde: Element = document.body): Promise<KeyboardEvent> {
      const evento = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true });
      desde.dispatchEvent(evento);
      await fixture.whenStable();
      fixture.detectChanges();
      return evento;
    }

    async function abrir(categoriaId: string, notaId: string): Promise<void> {
      await notes.seleccionarCategoria(categoriaId);
      await notes.seleccionarNota(notaId);
      fixture.detectChanges();
    }

    beforeEach(async () => {
      settings.carpetaRaiz.set('C:\\notas');
      notes = TestBed.inject(NotesService);
      await arrancar();
    });

    it('Ctrl+N crea una nota en la categoría activa', async () => {
      await notes.seleccionarCategoria('aws');
      const evento = await pulsar('n');
      expect(evento.defaultPrevented).toBeTrue();
      expect(notes.creando()).toBeTrue();
      expect(notes.notaActiva()?.categoriaId).toBe('aws');
    });

    it('Ctrl+N no crea nada en Favoritos ni en la papelera', async () => {
      const guardar = spyOn(TestBed.inject(NOTES_REPOSITORY), 'guardarNota').and.callThrough();
      for (const vista of [FAVORITOS, PAPELERA]) {
        await notes.seleccionarCategoria(vista);
        await pulsar('n');
        expect(notes.creando()).toBeFalse();
      }
      expect(guardar).not.toHaveBeenCalled();
    });

    it('Ctrl+K lleva el foco al buscador', async () => {
      await pulsar('k');
      expect(document.activeElement).toBe(elemento().querySelector('app-note-list .campo input'));
    });

    it('Ctrl+E alterna entre lectura y edición', async () => {
      await abrir('trabajo', '1');
      await pulsar('e');
      expect(notes.editando()).toBeTrue();
      await pulsar('e');
      expect(notes.editando()).toBeFalse();
    });

    it('Ctrl+S guarda sin esperar al autoguardado', async () => {
      await abrir('trabajo', '1');
      notes.editar();
      notes.actualizarBorrador({ contenido: 'Guardado con el atajo' });
      expect(notes.estadoGuardado()).toBe('pendiente');
      await pulsar('s');
      expect(notes.estadoGuardado()).toBe('guardado');
      expect(notes.notaActiva()?.contenido).toBe('Guardado con el atajo');
      expect(notes.editando()).toBeTrue();
    });

    it('Escape guarda lo pendiente y sale de la edición', async () => {
      await abrir('trabajo', '1');
      notes.editar();
      notes.actualizarBorrador({ contenido: 'Guardado al salir' });
      await pulsar('Escape', false);
      expect(notes.editando()).toBeFalse();
      expect(notes.notaActiva()?.contenido).toBe('Guardado al salir');
    });

    it('mientras se escribe el contenido solo valen Ctrl+S, Ctrl+E y Escape', async () => {
      await abrir('trabajo', '1');
      notes.editar();
      // El editor enriquecido se monta tras el siguiente render.
      fixture.detectChanges();
      await fixture.whenStable();
      const editor = elemento().querySelector('app-markdown-editor .ProseMirror') as HTMLElement;
      expect(editor).not.toBeNull();
      editor.focus();

      const nueva = await pulsar('n', true, editor);
      expect(nueva.defaultPrevented).toBeFalse();
      expect(notes.creando()).toBeFalse();
      await pulsar('k', true, editor);
      expect(document.activeElement).toBe(editor);

      notes.actualizarBorrador({ contenido: 'Desde el editor' });
      await pulsar('s', true, editor);
      expect(notes.notaActiva()?.contenido).toBe('Desde el editor');
      await pulsar('e', true, editor);
      expect(notes.editando()).toBeFalse();
    });

    it('Escape en el buscador no saca de la edición', async () => {
      await abrir('trabajo', '1');
      notes.editar();
      const buscador = elemento().querySelector('app-note-list .campo input') as HTMLElement;
      await pulsar('Escape', false, buscador);
      expect(notes.editando()).toBeTrue();
    });
  });

  it('muestra las notas cuando hay carpeta raíz configurada', async () => {
    settings.carpetaRaiz.set('C:\\notas');
    await arrancar();
    expect(elemento().querySelector('app-welcome')).toBeNull();
    expect(elemento().querySelector('app-sidebar')).not.toBeNull();
    expect(TestBed.inject(NotesService).categorias().length).toBeGreaterThan(0);
  });
});
