import { TestBed } from '@angular/core/testing';
import { MockNotesRepository } from './mock-notes.repository';
import { NOTES_REPOSITORY, NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';
import { SettingsService } from './settings.service';
import { FAVORITOS, PAPELERA } from '../models/category.model';

describe('NotesService: contador de favoritos', () => {
  let notes: NotesService;
  let repo: NotesRepository;
  let escaneos: jasmine.Spy;

  // La nota 3 (categoría «aws») es la única favorita de los datos de prueba.
  async function abrir(categoriaId: string, notaId: string): Promise<void> {
    await notes.seleccionarCategoria(categoriaId);
    await notes.seleccionarNota(notaId);
  }

  // El contador en memoria tiene que coincidir siempre con lo que diría un recorrido completo.
  async function esperarExacto(total: number): Promise<void> {
    expect(notes.totalFavoritos()).toBe(total);
    expect((await repo.listarFavoritas()).length).toBe(total);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    });
    const settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    settings.carpetaRaiz.set('C:\\notas');

    repo = TestBed.inject(NOTES_REPOSITORY);
    escaneos = spyOn(repo, 'listarFavoritas').and.callThrough();
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
    escaneos.calls.reset();
  });

  it('cuenta las favoritas al cargar', async () => {
    await esperarExacto(1);
  });

  it('marcar y desmarcar ajusta el contador sin recorrer las carpetas', async () => {
    await abrir('trabajo', '1');
    await notes.alternarFavorito();
    expect(notes.totalFavoritos()).toBe(2);
    await notes.alternarFavorito();
    expect(notes.totalFavoritos()).toBe(1);
    expect(escaneos).not.toHaveBeenCalled();
    await esperarExacto(1);
  });

  it('eliminar y restaurar una favorita ajusta el contador sin recorrer las carpetas', async () => {
    await abrir('aws', '3');
    await notes.eliminarNotaActiva();
    expect(notes.totalFavoritos()).toBe(0);

    await abrir(PAPELERA, '3');
    await notes.restaurarNotaActiva();
    expect(notes.totalFavoritos()).toBe(1);
    expect(escaneos).not.toHaveBeenCalled();
    await esperarExacto(1);
  });

  it('eliminar y restaurar una nota que no es favorita no cambia el contador', async () => {
    await abrir('trabajo', '1');
    await notes.eliminarNotaActiva();
    await abrir(PAPELERA, '1');
    await notes.restaurarNotaActiva();
    await esperarExacto(1);
  });

  it('en la vista de favoritos el contador sale de la lista', async () => {
    await abrir(FAVORITOS, '3');
    await notes.alternarFavorito();
    await esperarExacto(0);
  });

  it('recargar vuelve a contar desde cero', async () => {
    await repo.guardarNota({ ...(await repo.obtenerNota('1'))!, favorito: true });
    expect(notes.totalFavoritos()).toBe(1);
    await notes.recargar();
    await esperarExacto(2);
  });
});

describe('NotesService: guardar sin releer el disco', () => {
  let notes: NotesService;
  let repo: NotesRepository;
  let settings: SettingsService;
  let lecturasDeNotas: jasmine.Spy[];
  let listarCategorias: jasmine.Spy;

  const ids = () => notes.notasFiltradas().map((n) => n.id);

  async function abrir(categoriaId: string, notaId: string): Promise<void> {
    await notes.seleccionarCategoria(categoriaId);
    await notes.seleccionarNota(notaId);
    [...lecturasDeNotas, listarCategorias].forEach((espia) => espia.calls.reset());
  }

  // Igual que el usuario: entra en edición, escribe y sale, lo que guarda el borrador.
  async function editarYGuardar(cambios: { titulo?: string; contenido?: string }): Promise<void> {
    notes.editar();
    notes.actualizarBorrador(cambios);
    expect(await notes.salirDeEdicion()).toBeTrue();
  }

  function esperarSinLecturas(): void {
    lecturasDeNotas.forEach((espia) => expect(espia).not.toHaveBeenCalled());
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    });
    settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    settings.carpetaRaiz.set('C:\\notas');

    repo = TestBed.inject(NOTES_REPOSITORY);
    lecturasDeNotas = [
      spyOn(repo, 'listarNotas').and.callThrough(),
      spyOn(repo, 'listarFavoritas').and.callThrough(),
      spyOn(repo, 'listarPapelera').and.callThrough(),
    ];
    listarCategorias = spyOn(repo, 'listarCategorias').and.callThrough();
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
  });

  it('guardar desde una categoría no relee sus notas ni las carpetas', async () => {
    await abrir('trabajo', '2');
    await editarYGuardar({ contenido: 'Texto nuevo' });
    expect(notes.notaActiva()?.contenido).toBe('Texto nuevo');
    expect((await repo.obtenerNota('2'))?.contenido).toBe('Texto nuevo');
    esperarSinLecturas();
    expect(listarCategorias).not.toHaveBeenCalled();
  });

  it('la nota recién editada sube al principio al ordenar por recientes', async () => {
    await abrir('trabajo', '2');
    expect(ids()).toEqual(['1', '2']);
    await editarYGuardar({ contenido: 'Texto nuevo' });
    expect(ids()).toEqual(['2', '1']);
    esperarSinLecturas();
  });

  it('cambiar el título recoloca la nota al ordenar alfabéticamente', async () => {
    settings.ordenNotas.set('titulo');
    await abrir('trabajo', '1');
    expect(ids()).toEqual(['2', '1']);
    await editarYGuardar({ titulo: 'Aaa' });
    expect(ids()).toEqual(['1', '2']);
    esperarSinLecturas();
  });

  it('agregar una etiqueta no relee nada', async () => {
    await abrir('trabajo', '1');
    expect(await notes.agregarEtiqueta('nueva')).toBeTrue();
    expect(notes.notaActiva()?.tags).toContain('nueva');
    esperarSinLecturas();
    expect(listarCategorias).not.toHaveBeenCalled();
  });

  it('crear una nota actualiza el total de la categoría sin leer notas', async () => {
    await abrir('trabajo', '1');
    await notes.crearNota();
    expect(notes.notas().length).toBe(3);
    expect(notes.categoriaActiva()?.total).toBe(3);
    esperarSinLecturas();
  });

  describe('en la vista Favoritos', () => {
    // Favoritas: la 3 (de los datos de prueba) y la 1, que se marca aquí.
    beforeEach(async () => {
      await abrir('trabajo', '1');
      await notes.alternarFavorito();
      await abrir(FAVORITOS, '3');
    });

    it('guardar no recorre las carpetas', async () => {
      await editarYGuardar({ contenido: 'Texto nuevo' });
      expect(ids()).toEqual(['3', '1']);
      expect(notes.notaActiva()?.contenido).toBe('Texto nuevo');
      expect(notes.totalFavoritos()).toBe(2);
      esperarSinLecturas();
      expect(listarCategorias).not.toHaveBeenCalled();
    });

    it('desmarcar una favorita la quita de la lista sin recorrer las carpetas', async () => {
      notes.editar();
      notes.actualizarBorrador({ contenido: 'Texto nuevo' });
      await notes.alternarFavorito();
      expect(ids()).toEqual(['1']);
      expect(notes.notaActivaId()).toBeNull();
      expect(notes.editando()).toBeFalse();
      expect(notes.totalFavoritos()).toBe(1);
      esperarSinLecturas();
      // Lo que se estaba escribiendo se guardó junto con el cambio de favorito.
      expect(await repo.obtenerNota('3')).toEqual(jasmine.objectContaining({ favorito: false, contenido: 'Texto nuevo' }));
    });
  });
});
