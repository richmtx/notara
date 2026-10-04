import { TestBed } from '@angular/core/testing';
import { MockNotesRepository } from './mock-notes.repository';
import { NOTES_REPOSITORY, NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';
import { SettingsService } from './settings.service';
import { FAVORITOS, PAPELERA, SIN_CATEGORIA } from '../models/category.model';

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

describe('NotesService: eliminar una categoría', () => {
  let notes: NotesService;
  let repo: NotesRepository;

  // Datos de prueba: «trabajo» tiene las notas 1 y 2, «aws» la 3 (favorita) y «personal» está vacía.
  const idsCategorias = () => notes.categorias().map((c) => c.id);
  const enPapelera = async () => (await repo.listarPapelera()).map((n) => n.id).sort();

  async function abrir(categoriaId: string, notaId: string): Promise<void> {
    await notes.seleccionarCategoria(categoriaId);
    await notes.seleccionarNota(notaId);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    });
    const settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    settings.carpetaRaiz.set('C:\\notas');

    repo = TestBed.inject(NOTES_REPOSITORY);
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
  });

  it('elimina una categoría vacía sin tocar la papelera ni la selección', async () => {
    expect(await notes.consultarEliminacionCategoria('personal')).toBe(0);
    expect(await notes.eliminarCategoria('personal')).toBeTrue();
    expect(idsCategorias()).toEqual(['trabajo', 'aws', 'proyectos']);
    expect(await enPapelera()).toEqual([]);
    expect(notes.categoriaActivaId()).toBe('trabajo');
    expect(notes.error()).toBeNull();
  });

  it('las notas de la categoría pasan por la papelera conservando su origen', async () => {
    const descartar = spyOn(repo, 'descartarNota').and.callThrough();
    await notes.seleccionarCategoria('aws');
    expect(await notes.consultarEliminacionCategoria('trabajo')).toBe(2);
    expect(await notes.eliminarCategoria('trabajo')).toBeTrue();

    expect(idsCategorias()).not.toContain('trabajo');
    expect(descartar).not.toHaveBeenCalled();
    const papelera = await repo.listarPapelera();
    expect(papelera.map((n) => n.id).sort()).toEqual(['1', '2']);
    expect(papelera.every((n) => n.categoriaId === 'trabajo')).toBeTrue();
    // La vista en la que estaba el usuario no cambia.
    expect(notes.categoriaActivaId()).toBe('aws');
  });

  it('eliminar la categoría activa deja la selección vacía y cierra la nota abierta', async () => {
    await abrir('trabajo', '1');
    expect(await notes.eliminarCategoria('trabajo')).toBeTrue();
    expect(notes.categoriaActivaId()).toBeNull();
    expect(notes.notaActivaId()).toBeNull();
    expect(notes.notas()).toEqual([]);
  });

  it('cierra la nota abierta desde Favoritos y ajusta el contador', async () => {
    await abrir(FAVORITOS, '3');
    expect(await notes.eliminarCategoria('aws')).toBeTrue();
    expect(notes.categoriaActivaId()).toBe(FAVORITOS);
    expect(notes.notaActivaId()).toBeNull();
    expect(notes.totalFavoritos()).toBe(0);
  });

  it('ajusta el contador de favoritos desde otra categoría', async () => {
    expect(await notes.eliminarCategoria('aws')).toBeTrue();
    expect(notes.totalFavoritos()).toBe(0);
  });

  it('guarda lo que se estaba escribiendo antes de mover la nota a la papelera', async () => {
    await abrir('trabajo', '1');
    notes.editar();
    notes.actualizarBorrador({ contenido: 'Texto a medias' });
    expect(await notes.eliminarCategoria('trabajo')).toBeTrue();
    expect(notes.editando()).toBeFalse();
    const nota = (await repo.listarPapelera()).find((n) => n.id === '1');
    expect(nota?.contenido).toBe('Texto a medias');
  });

  it('no elimina nada si los cambios sin guardar no se pueden guardar', async () => {
    const eliminar = spyOn(repo, 'eliminarCategoria').and.callThrough();
    await abrir('trabajo', '1');
    notes.editar();
    notes.actualizarBorrador({ contenido: 'Texto a medias' });
    spyOn(repo, 'guardarNota').and.rejectWith('disco lleno');

    expect(await notes.eliminarCategoria('trabajo')).toBeFalse();
    expect(eliminar).not.toHaveBeenCalled();
    expect(idsCategorias()).toContain('trabajo');
    expect(notes.borrador()?.contenido).toBe('Texto a medias');
    expect(notes.error()).toContain('disco lleno');
  });

  it('se niega a eliminar una carpeta con contenido que no gestiona', async () => {
    spyOn(repo, 'contenidoCategoria').and.resolveTo({ notas: 2, ajenos: ['foto.png', 'adjuntos'] });
    spyOn(repo, 'eliminarCategoria').and.resolveTo({
      eliminada: false,
      movidas: 0,
      pendientes: 2,
      ajenos: ['foto.png', 'adjuntos'],
    });

    expect(await notes.consultarEliminacionCategoria('trabajo')).toBeNull();
    expect(notes.error()).toContain('foto.png');
    // Aunque se llegara a pedir, la negativa del repositorio tampoco pasa en silencio.
    notes.error.set(null);
    expect(await notes.eliminarCategoria('trabajo')).toBeFalse();
    expect(notes.error()).toContain('adjuntos');
    expect(idsCategorias()).toContain('trabajo');
    expect(notes.categoriaActivaId()).toBe('trabajo');
  });

  it('si falla a medias informa de qué se movió y qué no', async () => {
    const original = repo.eliminarNota.bind(repo);
    let llamadas = 0;
    spyOn(repo, 'eliminarNota').and.callFake((id) =>
      llamadas++ ? Promise.reject('archivo en uso') : original(id)
    );

    expect(await notes.eliminarCategoria('trabajo')).toBeFalse();
    expect(notes.error()).toContain('1 nota ya está en la papelera');
    expect(notes.error()).toContain('1 nota sigue en la carpeta');
    expect(notes.error()).toContain('archivo en uso');
    // La lista refleja el estado real: la categoría sigue ahí con la nota que no se movió.
    expect(notes.categoriaActiva()?.total).toBe(1);
    expect(notes.notas().length).toBe(1);
    expect((await enPapelera()).length).toBe(1);
  });

  it('restaurar una nota de una categoría eliminada vuelve a crear la categoría', async () => {
    expect(await notes.eliminarCategoria('aws')).toBeTrue();
    expect(idsCategorias()).not.toContain('aws');

    await abrir(PAPELERA, '3');
    await notes.restaurarNotaActiva();

    // La categoría recreada aparece en la lista sin recargar, con la nota dentro.
    expect(notes.categorias().find((c) => c.id === 'aws')?.total).toBe(1);
    expect((await repo.listarNotas('aws')).map((n) => n.id)).toEqual(['3']);
    expect((await repo.listarNotas(SIN_CATEGORIA)).length).toBe(0);
    expect(await enPapelera()).toEqual([]);
    expect(notes.aviso()).toContain('se volvió a crear');
    expect(notes.totalFavoritos()).toBe(1);
  });

  it('restaurar en una categoría que sigue existiendo no avisa de ninguna recreación', async () => {
    await abrir('trabajo', '1');
    await notes.eliminarNotaActiva();
    await abrir(PAPELERA, '1');
    await notes.restaurarNotaActiva();

    expect((await repo.listarNotas('trabajo')).length).toBe(2);
    expect(notes.aviso()).not.toContain('se volvió a crear');
  });

  it('«Sin categoría» no es una carpeta y no se puede eliminar', async () => {
    const eliminar = spyOn(repo, 'eliminarCategoria').and.callThrough();
    expect(await notes.consultarEliminacionCategoria(SIN_CATEGORIA)).toBeNull();
    expect(await notes.eliminarCategoria(SIN_CATEGORIA)).toBeFalse();
    expect(eliminar).not.toHaveBeenCalled();
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
