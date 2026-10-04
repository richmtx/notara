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

describe('NotesService: búsqueda global', () => {
  let notes: NotesService;
  let repo: NotesRepository;
  let listarTodas: jasmine.Spy;

  // Datos de prueba: «trabajo» tiene las notas 1 y 2, «aws» la 3 y «proyectos» la 4.
  const ids = () => notes.notasFiltradas().map((n) => n.id);

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
    settings.carpetaRaiz.set('C:\notas');

    repo = TestBed.inject(NOTES_REPOSITORY);
    listarTodas = spyOn(repo, 'listarTodas').and.callThrough();
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
    await notes.seleccionarCategoria('trabajo');
    listarTodas.calls.reset();
  });

  it('encuentra notas de otras categorías por título y por contenido', async () => {
    await notes.buscar('aws');
    expect(ids()).toEqual(['3']);
    await notes.buscar('diseño');
    expect(ids()).toEqual(['4']);
    // Cada resultado dice de qué categoría es, que no es la activa.
    expect(notes.buscandoGlobal()).toBeTrue();
    expect(notes.nombreCategoria(notes.notasFiltradas()[0].categoriaId)).toBe('Proyectos');
    expect(notes.categoriaActivaId()).toBe('trabajo');
  });

  it('al limpiar la búsqueda la lista vuelve a la categoría activa', async () => {
    await notes.buscar('aws');
    await notes.buscar('');
    expect(notes.buscandoGlobal()).toBeFalse();
    expect(ids()).toEqual(['1', '2']);
  });

  it('lee todas las notas una sola vez y después busca en memoria', async () => {
    expect(listarTodas).not.toHaveBeenCalled();
    await notes.buscar('a');
    await notes.buscar('aw');
    await notes.buscar('');
    await notes.buscar('login');
    expect(listarTodas).toHaveBeenCalledTimes(1);
  });

  it('un guardado actualiza el índice sin releer las notas', async () => {
    await notes.buscar('aws');
    await notes.buscar('');
    await notes.seleccionarNota('1');
    notes.editar();
    notes.actualizarBorrador({ contenido: 'Ahora habla de zanahorias' });
    expect(await notes.salirDeEdicion()).toBeTrue();

    await notes.buscar('zanahorias');
    expect(ids()).toEqual(['1']);
    await notes.buscar('README');
    expect(ids()).toEqual([]);
    expect(listarTodas).toHaveBeenCalledTimes(1);
  });

  it('una nota abierta desde los resultados se edita sin cambiar de categoría', async () => {
    await notes.buscar('aws');
    await notes.seleccionarNota('3');
    expect(notes.notaActiva()?.id).toBe('3');
    notes.editar();
    notes.actualizarBorrador({ contenido: 'Ruta de estudio para AWS, revisada' });
    expect(await notes.salirDeEdicion()).toBeTrue();

    expect((await repo.obtenerNota('3'))?.contenido).toBe('Ruta de estudio para AWS, revisada');
    expect(notes.notaActiva()?.contenido).toBe('Ruta de estudio para AWS, revisada');
    expect(notes.categoriaActivaId()).toBe('trabajo');
    // La nota no se cuela en la lista de la categoría activa.
    expect(notes.notas().map((n) => n.id).sort()).toEqual(['1', '2']);
    expect(notes.categoriaActiva()?.total).toBe(2);
  });

  it('eliminar un resultado lo quita de la búsqueda', async () => {
    await notes.buscar('a');
    await notes.seleccionarNota('3');
    await notes.eliminarNotaActiva();
    expect(ids()).not.toContain('3');
    expect(notes.notaActivaId()).toBeNull();
    expect(notes.totalFavoritos()).toBe(0);
  });

  it('marcar como favorita desde los resultados, estando en Favoritos, la suma a la vista', async () => {
    await notes.seleccionarCategoria(FAVORITOS);
    await notes.buscar('login');
    await notes.seleccionarNota('4');
    expect(await notes.alternarFavorito()).toBeTrue();
    expect(notes.totalFavoritos()).toBe(2);
    await notes.buscar('');
    expect(ids().sort()).toEqual(['3', '4']);
  });

  it('en la papelera la búsqueda no sale de la papelera', async () => {
    await abrir('trabajo', '1');
    await notes.eliminarNotaActiva();
    await notes.seleccionarCategoria(PAPELERA);
    listarTodas.calls.reset();

    // «a» aparece en todas las notas, pero solo la 1 está en la papelera.
    await notes.buscar('a');
    expect(notes.buscandoGlobal()).toBeFalse();
    expect(ids()).toEqual(['1']);
    await notes.buscar('aws');
    expect(ids()).toEqual([]);
    expect(listarTodas).not.toHaveBeenCalled();
  });

  it('si no se pueden leer las notas lo dice y sigue buscando en la categoría activa', async () => {
    listarTodas.and.rejectWith('disco no disponible');
    await notes.buscar('perfil');
    expect(notes.error()).toContain('disco no disponible');
    expect(ids()).toEqual(['1']);
  });
});

describe('NotesService: cambios hechos fuera de la app', () => {
  let notes: NotesService;
  let repo: MockNotesRepository;
  let lecturas: jasmine.Spy[];

  // Datos de prueba: «trabajo» tiene las notas 1 y 2, «aws» la 3 (favorita) y «proyectos» la 4.
  const ids = () => notes.notasFiltradas().map((n) => n.id);
  const enDisco = async (id: string) => (await repo.obtenerNota(id))!;

  // La revisión de los cambios va en la misma cola que los guardados: cuando termina un guardado
  // pedido después, ella ya terminó.
  const revisado = () => notes.guardarAhora();

  async function abrir(categoriaId: string, notaId: string): Promise<void> {
    await notes.seleccionarCategoria(categoriaId);
    await notes.seleccionarNota(notaId);
    lecturas.forEach((espia) => espia.calls.reset());
  }

  async function editarPorFuera(id: string, contenido: string, avisar = true): Promise<void> {
    repo.guardarPorFuera({ ...(await enDisco(id)), contenido, editadaEn: new Date() }, avisar);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    });
    const settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    settings.carpetaRaiz.set('C:\\notas');

    repo = TestBed.inject(NOTES_REPOSITORY) as MockNotesRepository;
    lecturas = [
      spyOn(repo, 'listarCategorias').and.callThrough(),
      spyOn(repo, 'listarNotas').and.callThrough(),
      spyOn(repo, 'listarTodas').and.callThrough(),
      spyOn(repo, 'listarPapelera').and.callThrough(),
    ];
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
  });

  it('los guardados de la propia app no provocan ningún refresco', async () => {
    await abrir('trabajo', '1');
    notes.editar();
    notes.actualizarBorrador({ contenido: 'Primer guardado' });
    await notes.guardarAhora();
    // El watcher salta con cada escritura, también con las de la app.
    repo.detectar();
    await revisado();
    notes.actualizarBorrador({ contenido: 'Segundo guardado' });
    await notes.guardarAhora();
    repo.detectar();
    repo.detectar();
    await revisado();

    lecturas.forEach((espia) => expect(espia).not.toHaveBeenCalled());
    expect(notes.conflicto()).toBeNull();
    expect(notes.aviso()).toBeNull();
    expect(notes.editando()).toBeTrue();
    expect(notes.borrador()?.contenido).toBe('Segundo guardado');
    expect((await enDisco('1')).contenido).toBe('Segundo guardado');
  });

  it('una nota creada por fuera aparece sin perder la selección', async () => {
    await abrir('trabajo', '1');
    repo.guardarPorFuera({ ...(await enDisco('2')), id: '9', titulo: 'Llegada de fuera' });
    await revisado();

    expect(ids()).toContain('9');
    expect(notes.categoriaActiva()?.total).toBe(3);
    expect(notes.categoriaActivaId()).toBe('trabajo');
    expect(notes.notaActivaId()).toBe('1');
  });

  it('la nota abierta en lectura se actualiza con lo que cambió por fuera', async () => {
    await abrir('trabajo', '1');
    await editarPorFuera('1', 'Editada con otro programa');
    await revisado();

    expect(notes.notaActiva()?.contenido).toBe('Editada con otro programa');
    expect(notes.contenidoHtml()).toContain('Editada con otro programa');
    expect(notes.conflicto()).toBeNull();
    expect(notes.aviso()).toContain('se actualizó');
  });

  it('un cambio en otra categoría no relee la vista activa pero sí los totales', async () => {
    await abrir('trabajo', '1');
    repo.eliminarPorFuera('4');
    await revisado();

    expect(repo.listarNotas).not.toHaveBeenCalled();
    expect(notes.categorias().find((c) => c.id === 'proyectos')?.total).toBe(0);
    expect(notes.notaActivaId()).toBe('1');
  });

  it('una favorita eliminada por fuera deja de contarse', async () => {
    await abrir('trabajo', '1');
    repo.eliminarPorFuera('3');
    await revisado();
    expect(notes.totalFavoritos()).toBe(0);
  });

  it('si la nota abierta en lectura se elimina por fuera, se cierra y se avisa', async () => {
    await abrir('trabajo', '1');
    repo.eliminarPorFuera('1');
    await revisado();

    expect(notes.notaActivaId()).toBeNull();
    expect(ids()).toEqual(['2']);
    expect(notes.aviso()).toContain('Perfil GitHub');
    expect(notes.categoriaActivaId()).toBe('trabajo');
  });

  it('los resultados de una búsqueda global también se actualizan', async () => {
    await notes.seleccionarCategoria('trabajo');
    await notes.buscar('zanahorias');
    expect(ids()).toEqual([]);
    await editarPorFuera('4', 'Ahora habla de zanahorias');
    await revisado();
    expect(ids()).toEqual(['4']);
    expect(notes.filtroBusqueda()).toBe('zanahorias');
  });

  describe('con la nota en edición', () => {
    beforeEach(async () => {
      await abrir('trabajo', '1');
      notes.editar();
      notes.actualizarBorrador({ contenido: 'Lo que estoy escribiendo' });
    });

    it('un cambio en otra nota no toca lo que se está escribiendo', async () => {
      await editarPorFuera('2', 'Otra nota, editada por fuera');
      await revisado();

      expect(notes.conflicto()).toBeNull();
      expect(notes.editando()).toBeTrue();
      expect(notes.notas().find((n) => n.id === '2')?.contenido).toBe('Otra nota, editada por fuera');
      // El borrador se guardó como siempre.
      expect((await enDisco('1')).contenido).toBe('Lo que estoy escribiendo');
    });

    it('si la nota cambia por fuera avisa del conflicto y no pisa ninguna de las dos versiones', async () => {
      await editarPorFuera('1', 'Versión de fuera');
      await revisado();

      expect(notes.conflicto()).toBe('modificada');
      expect(notes.aviso()).toContain('cambió fuera de Notara');
      expect(notes.editando()).toBeTrue();
      expect(notes.borrador()?.contenido).toBe('Lo que estoy escribiendo');
      expect((await enDisco('1')).contenido).toBe('Versión de fuera');

      // Ni seguir escribiendo ni intentar salir guardan nada mientras no se resuelva.
      notes.actualizarBorrador({ contenido: 'Sigo escribiendo' });
      expect(await notes.salirDeEdicion()).toBeFalse();
      expect(await notes.agregarEtiqueta('nueva')).toBeFalse();
      expect(notes.editando()).toBeTrue();
      expect((await enDisco('1')).contenido).toBe('Versión de fuera');
      expect(notes.error()).toContain('elige');
    });

    it('conservar mi versión guarda el borrador y cierra el conflicto', async () => {
      await editarPorFuera('1', 'Versión de fuera');
      await revisado();
      await notes.resolverConflicto('mia');

      expect(notes.conflicto()).toBeNull();
      expect(notes.editando()).toBeTrue();
      expect((await enDisco('1')).contenido).toBe('Lo que estoy escribiendo');
      expect(await notes.salirDeEdicion()).toBeTrue();
    });

    it('cargar la versión del disco descarta el borrador', async () => {
      await editarPorFuera('1', 'Versión de fuera');
      await revisado();
      await notes.resolverConflicto('disco');

      expect(notes.conflicto()).toBeNull();
      expect(notes.editando()).toBeFalse();
      expect(notes.notaActiva()?.contenido).toBe('Versión de fuera');
      expect((await enDisco('1')).contenido).toBe('Versión de fuera');
    });

    it('un guardado que llega antes que el aviso del watcher tampoco pisa el cambio externo', async () => {
      // El archivo ya cambió en disco, pero el watcher aún no lo ha notificado.
      await editarPorFuera('1', 'Versión de fuera', false);
      expect(await notes.salirDeEdicion()).toBeFalse();
      await revisado();

      expect((await enDisco('1')).contenido).toBe('Versión de fuera');
      expect(notes.conflicto()).toBe('modificada');
      expect(notes.borrador()?.contenido).toBe('Lo que estoy escribiendo');
    });

    it('si la nota se elimina por fuera sigue abierta, con lo escrito, hasta decidir', async () => {
      repo.eliminarPorFuera('1');
      await revisado();

      expect(notes.conflicto()).toBe('eliminada');
      expect(notes.notaActivaId()).toBe('1');
      expect(notes.borrador()?.contenido).toBe('Lo que estoy escribiendo');
      expect(await repo.obtenerNota('1')).toBeNull();

      await notes.resolverConflicto('mia');
      expect(notes.conflicto()).toBeNull();
      expect((await enDisco('1')).contenido).toBe('Lo que estoy escribiendo');
      expect(notes.categoriaActiva()?.total).toBe(2);
    });

    it('descartar una nota eliminada por fuera la cierra', async () => {
      repo.eliminarPorFuera('1');
      await revisado();
      await notes.resolverConflicto('disco');

      expect(notes.conflicto()).toBeNull();
      expect(notes.editando()).toBeFalse();
      expect(notes.notaActivaId()).toBeNull();
      expect(ids()).toEqual(['2']);
    });
  });

  it('al recargar la carpeta deja de vigilar la anterior', async () => {
    const dejar = jasmine.createSpy('dejarDeVigilar');
    const vigilar = spyOn(repo, 'vigilar').and.resolveTo(dejar);
    await notes.recargar();
    expect(dejar).not.toHaveBeenCalled();
    await notes.recargar();
    expect(vigilar).toHaveBeenCalledTimes(2);
    expect(dejar).toHaveBeenCalledTimes(1);
  });

  it('si no se puede vigilar la carpeta lo dice, y la app sigue funcionando', async () => {
    spyOn(repo, 'vigilar').and.rejectWith('permiso denegado');
    await notes.recargar();
    expect(notes.error()).toContain('permiso denegado');
    expect(notes.categorias().length).toBeGreaterThan(0);
  });

  it('si no se pueden revisar los cambios lo dice', async () => {
    spyOn(repo, 'cambiosExternos').and.rejectWith('disco no disponible');
    repo.detectar();
    await revisado();
    expect(notes.error()).toContain('disco no disponible');
  });
});
