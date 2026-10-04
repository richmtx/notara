import { Injectable, inject, signal, computed } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';
import { marked } from 'marked';
import { EliminacionCategoria, NOTES_REPOSITORY } from './notes.repository';
import { SettingsService } from './settings.service';
import { idaYVueltaSegura } from './markdown-editor';
import { sanearNombreCarpeta } from './frontmatter';
import { Note, OrdenNotas, TITULO_POR_DEFECTO, crearNotaVacia, esTextoPlano } from '../models/note.model';
import { Category, FAVORITOS, PAPELERA, SIN_CATEGORIA } from '../models/category.model';

export interface Borrador {
    titulo: string;
    contenido: string;
}

export type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error';

// 'resolviendo' = todavía no se sabe si hay carpeta configurada: los ajustes se leen de forma asíncrona.
export type EstadoArranque = 'resolviendo' | 'sin-carpeta' | 'lista';

const ESPERA_AUTOGUARDADO = 800;
const DURACION_AVISO = 6000;

const COMPARADORES: Record<OrdenNotas, (a: Note, b: Note) => number> = {
    editada: (a, b) => b.editadaEn.getTime() - a.editadaEn.getTime(),
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base', numeric: true }),
    creada: (a, b) => b.creadaEn.getTime() - a.creadaEn.getTime(),
};

const cuantasNotas = (total: number) => (total === 1 ? '1 nota' : `${total} notas`);

@Injectable({ providedIn: 'root' })
export class NotesService {
    private repo = inject(NOTES_REPOSITORY);
    private settings = inject(SettingsService);

    readonly categorias = signal<Category[]>([]);
    readonly notas = signal<Note[]>([]);
    readonly categoriaActivaId = signal<string | null>(null);
    readonly notaActivaId = signal<string | null>(null);
    readonly filtroBusqueda = signal('');
    readonly cargando = signal(false);
    readonly error = signal<string | null>(null);
    // Mensaje informativo (no es un fallo) que se retira solo al cabo de unos segundos.
    readonly aviso = signal<string | null>(null);
    readonly totalFavoritos = signal(0);

    // Lo que el usuario está escribiendo. Vive aparte de `notas` para que refrescar
    // la lista desde disco nunca pise el texto en curso. null = modo lectura.
    readonly borrador = signal<Borrador | null>(null);
    readonly editando = computed(() => this.borrador() !== null);
    readonly estadoGuardado = signal<EstadoGuardado>('inactivo');
    // La nota en edición se acaba de crear y todavía puede cancelarse sin dejar rastro.
    readonly creando = signal(false);
    // true = editor enriquecido; false = texto plano (.txt, o Markdown que el editor no conservaría).
    readonly edicionEnriquecida = signal(false);

    private temporizador: ReturnType<typeof setTimeout> | null = null;
    private temporizadorAviso: ReturnType<typeof setTimeout> | null = null;
    // Las escrituras van en serie: guardar puede renombrar el archivo y cambiar el id de la nota.
    private cola: Promise<unknown> = Promise.resolve();

    readonly carpetaRaiz = computed(() => this.settings.carpetaRaiz());
    readonly orden = computed(() => this.settings.ordenNotas());

    private readonly inicializando = signal(true);
    // Hasta que termina inicializar(), una carpeta raíz nula no significa que no haya ninguna.
    readonly arranque = computed<EstadoArranque>(() => {
        if (this.inicializando()) return 'resolviendo';
        return this.carpetaRaiz() ? 'lista' : 'sin-carpeta';
    });

    readonly categoriaActiva = computed(
        () => this.categorias().find((c) => c.id === this.categoriaActivaId()) ?? null
    );

    readonly enFavoritos = computed(() => this.categoriaActivaId() === FAVORITOS);
    // La papelera es de solo lectura: sus notas solo se pueden restaurar o borrar.
    readonly enPapelera = computed(() => this.categoriaActivaId() === PAPELERA);

    // Nombre de lo que muestra la lista central: una categoría o una vista.
    readonly nombreVista = computed(() => {
        if (this.enFavoritos()) return 'Favoritos';
        if (this.enPapelera()) return 'Papelera';
        return this.categoriaActiva()?.nombre ?? null;
    });

    // Una nota nueva necesita una carpeta: Favoritos reúne varias y la papelera no admite cambios.
    readonly puedeCrear = computed(() => !this.enFavoritos() && !this.enPapelera());

    readonly notaActiva = computed(
        () => this.notas().find((n) => n.id === this.notaActivaId()) ?? null
    );

    // Categorías a las que puede moverse la nota activa: todas menos la suya.
    readonly categoriasDestino = computed(() => {
        const nota = this.notaActiva();
        return nota ? this.categorias().filter((c) => c.id !== nota.categoriaId) : [];
    });

    readonly notaActivaEsTextoPlano = computed(() => {
        const nota = this.notaActiva();
        return !!nota && esTextoPlano(nota);
    });

    // La nota que se está creando va siempre primero, sea cual sea el orden elegido y aunque
    // algún archivo tenga una fecha posterior a la del reloj.
    private readonly notasOrdenadas = computed(() => {
        const notas = [...this.notas()].sort(COMPARADORES[this.orden()]);
        const nueva = this.creando() ? notas.find((n) => n.id === this.notaActivaId()) : undefined;
        return nueva ? [nueva, ...notas.filter((n) => n !== nueva)] : notas;
    });

    readonly notasFiltradas = computed(() => {
        const q = this.filtroBusqueda().trim().toLowerCase();
        if (!q) return this.notasOrdenadas();
        return this.notasOrdenadas().filter(
            (n) => n.titulo.toLowerCase().includes(q) || n.contenido.toLowerCase().includes(q)
        );
    });

    readonly contenidoHtml = computed(() => {
        const nota = this.notaActiva();
        if (!nota) return '';
        return marked.parse(nota.contenido, { async: false }) as string;
    });

    async inicializar(): Promise<void> {
        try {
            await this.settings.cargar();
            if (this.settings.carpetaRaiz()) {
                await this.recargar();
            }
        } finally {
            // También si la lectura falla: se cae a la bienvenida en vez de quedarse cargando.
            this.inicializando.set(false);
        }
    }

    async elegirCarpeta(): Promise<void> {
        const ruta = await open({ directory: true, multiple: false });
        if (typeof ruta !== 'string') return;
        if (!(await this.salirDeEdicion())) return;
        await this.settings.guardarCarpetaRaiz(ruta);
        await this.recargar();
    }

    async recargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);
        try {
            const cats = await this.repo.listarCategorias();
            this.categorias.set(cats);
            if (cats.length) {
                await this.seleccionarCategoria(cats[0].id);
            } else {
                this.notas.set([]);
                this.categoriaActivaId.set(null);
                this.notaActivaId.set(null);
            }
            await this.contarFavoritos();
        } catch (e) {
            this.error.set(`No se pudo leer la carpeta: ${e}`);
        } finally {
            this.cargando.set(false);
        }
    }

    async seleccionarCategoria(id: string): Promise<void> {
        if (!(await this.salirDeEdicion())) return;
        this.categoriaActivaId.set(id);
        this.filtroBusqueda.set('');
        this.cargando.set(true);
        try {
            const notas = await this.listarVista(id);
            this.notas.set(notas);
            this.notaActivaId.set(null);
        } catch (e) {
            this.error.set(`No se pudieron leer las notas: ${e}`);
            this.notas.set([]);
        } finally {
            this.cargando.set(false);
        }
    }

    // Devuelve false si hubo un error y conviene dejar el campo abierto para corregir el nombre.
    async crearCategoria(nombre: string): Promise<boolean> {
        const limpio = sanearNombreCarpeta(nombre);
        if (!limpio) return true;

        this.error.set(null);
        // Windows no distingue mayúsculas en los nombres de carpeta.
        if (this.categorias().some((c) => c.carpeta.toLowerCase() === limpio.toLowerCase())) {
            this.error.set(`Ya existe una categoría llamada «${limpio}».`);
            return false;
        }
        if (!(await this.salirDeEdicion())) return false;

        try {
            const creada = await this.repo.crearCategoria(limpio);
            this.categorias.set(await this.repo.listarCategorias());
            await this.seleccionarCategoria(creada.id);
            return true;
        } catch (e) {
            this.error.set(`No se pudo crear la categoría: ${e}`);
            return false;
        }
    }

    // Paso previo a la confirmación: cuántas notas irían a la papelera. Devuelve null, con el
    // motivo en `error`, si la categoría no se puede eliminar.
    async consultarEliminacionCategoria(id: string): Promise<number | null> {
        const categoria = this.categoriaEliminable(id);
        if (!categoria) return null;
        this.error.set(null);
        try {
            const { notas, ajenos } = await this.repo.contenidoCategoria(id);
            if (!ajenos.length) return notas;
            this.error.set(this.avisoContenidoAjeno(categoria.nombre, ajenos));
        } catch (e) {
            this.error.set(`No se pudo revisar la categoría: ${e}`);
        }
        return null;
    }

    // Las notas de la categoría pasan a la papelera y la carpeta se borra. Devuelve false si la
    // categoría sigue existiendo; el motivo queda en `error`.
    async eliminarCategoria(id: string): Promise<boolean> {
        const categoria = this.categoriaEliminable(id);
        if (!categoria) return false;
        // Lo que se esté escribiendo en una nota de la categoría tiene que quedar guardado antes
        // de moverla: si el guardado falla, no se elimina nada.
        if (this.notaActiva()?.categoriaId === id && !(await this.salirDeEdicion())) return false;

        return this.encolar(async () => {
            this.error.set(null);
            // Mientras esperaba su turno en la cola se volvió a abrir una nota de la categoría.
            if (this.borrador() && this.notaActiva()?.categoriaId === id) {
                this.error.set(`Hay una nota de «${categoria.nombre}» en edición: sal de la edición antes de eliminar la categoría.`);
                return false;
            }

            let resultado: EliminacionCategoria;
            try {
                resultado = await this.repo.eliminarCategoria(id);
            } catch (e) {
                this.error.set(`No se pudo eliminar la categoría: ${e}`);
                return false;
            }
            if (resultado.ajenos.length) {
                this.error.set(this.avisoContenidoAjeno(categoria.nombre, resultado.ajenos));
                return false;
            }

            if (resultado.eliminada && this.categoriaActivaId() === id) {
                this.categoriaActivaId.set(null);
                this.filtroBusqueda.set('');
            }
            // Se relee también si quedó a medias: parte de las notas ya está en la papelera.
            await this.refrescar();
            // Entre las notas movidas puede haber favoritas, y aquí no se sabe cuáles eran.
            if (resultado.movidas && !this.enFavoritos()) await this.contarFavoritos();

            if (resultado.eliminada) {
                this.avisar(
                    resultado.movidas
                        ? `Se eliminó «${categoria.nombre}» y ${cuantasNotas(resultado.movidas)} se ${resultado.movidas === 1 ? 'movió' : 'movieron'} a la papelera.`
                        : `Se eliminó la categoría «${categoria.nombre}».`
                );
            } else {
                this.error.set(this.avisoEliminacionIncompleta(categoria.nombre, resultado));
            }
            return resultado.eliminada;
        });
    }

    // «Sin categoría» son los archivos sueltos de la raíz, no una carpeta que se pueda borrar.
    private categoriaEliminable(id: string): Category | null {
        if (id === SIN_CATEGORIA) return null;
        return this.categorias().find((c) => c.id === id) ?? null;
    }

    private avisoContenidoAjeno(nombre: string, ajenos: string[]): string {
        const muestra = ajenos.slice(0, 3).join(', ');
        const resto = ajenos.length > 3 ? ` y ${ajenos.length - 3} más` : '';
        return `«${nombre}» no se eliminó: la carpeta tiene contenido que Notara no gestiona (${muestra}${resto}). Revísala manualmente.`;
    }

    private avisoEliminacionIncompleta(nombre: string, { movidas, pendientes, motivo }: EliminacionCategoria): string {
        const enPapelera = movidas
            ? `${cuantasNotas(movidas)} ya ${movidas === 1 ? 'está' : 'están'} en la papelera`
            : 'ninguna nota se movió';
        const queda = pendientes
            ? `${cuantasNotas(pendientes)} ${pendientes === 1 ? 'sigue' : 'siguen'} en la carpeta`
            : 'la carpeta no se pudo borrar';
        return `«${nombre}» no se eliminó del todo: ${enPapelera} y ${queda} (${motivo}).`;
    }

    async seleccionarNota(id: string): Promise<void> {
        if (id === this.notaActivaId()) return;
        if (!(await this.salirDeEdicion())) return;
        this.notaActivaId.set(id);
    }

    async cambiarOrden(orden: OrdenNotas): Promise<void> {
        try {
            await this.settings.guardarOrdenNotas(orden);
        } catch (e) {
            this.error.set(`No se pudo guardar el orden elegido: ${e}`);
        }
    }

    nombreCategoria(id: string): string {
        if (id === SIN_CATEGORIA) return 'Sin categoría';
        return this.categorias().find((c) => c.id === id)?.nombre ?? id;
    }

    async crearNota(): Promise<void> {
        if (!this.puedeCrear()) return;
        if (!(await this.salirDeEdicion())) return;
        await this.encolar(async () => {
            const categoriaId = this.categoriaActivaId() ?? SIN_CATEGORIA;
            const creada = await this.persistir(crearNotaVacia(categoriaId));
            if (!creada) return;
            this.filtroBusqueda.set('');
            // Título vacío en el borrador: el campo muestra el placeholder y se escribe encima.
            this.edicionEnriquecida.set(true);
            this.borrador.set({ titulo: '', contenido: creada.contenido });
            this.creando.set(true);
        });
    }

    // Deshace "Nueva nota": borra el archivo recién creado (sin papelera) y deja el visor vacío.
    async cancelarCreacion(): Promise<void> {
        this.cancelarTemporizador();
        await this.encolar(async () => {
            const nota = this.notaActiva();
            if (!this.creando() || !nota) return;
            this.error.set(null);
            try {
                await this.repo.descartarNota(nota.id);
            } catch (e) {
                this.error.set(`No se pudo descartar la nota: ${e}`);
                return;
            }
            this.cancelarTemporizador();
            this.cerrarBorrador();
            this.notaActivaId.set(null);
            await this.refrescar();
            if (nota.favorito) this.ajustarFavoritos(-1);
        });
    }

    editar(): void {
        const nota = this.notaActiva();
        if (!nota || this.borrador() || this.enPapelera()) return;
        this.estadoGuardado.set('inactivo');
        this.edicionEnriquecida.set(!esTextoPlano(nota) && idaYVueltaSegura(nota.contenido));
        this.borrador.set({ titulo: nota.titulo, contenido: nota.contenido });
    }

    // El editor enriquecido falló: se avisa y se sigue editando el Markdown como texto.
    usarEdicionPlana(motivo: string): void {
        this.error.set(motivo);
        this.edicionEnriquecida.set(false);
    }

    actualizarBorrador(cambios: Partial<Borrador>): void {
        const actual = this.borrador();
        if (!actual) return;
        this.borrador.set({ ...actual, ...cambios });
        this.estadoGuardado.set('pendiente');
        this.cancelarTemporizador();
        this.temporizador = setTimeout(() => {
            this.temporizador = null;
            void this.guardarBorrador();
        }, ESPERA_AUTOGUARDADO);
    }

    // Guarda lo pendiente y vuelve a lectura. Si el guardado falla se queda en edición
    // (devuelve false) para no perder lo escrito.
    async salirDeEdicion(): Promise<boolean> {
        if (!this.borrador()) return true;
        if (!(await this.guardarBorrador())) return false;
        this.cerrarBorrador();
        return true;
    }

    private cerrarBorrador(): void {
        this.borrador.set(null);
        this.creando.set(false);
        this.estadoGuardado.set('inactivo');
    }

    async alternarFavorito(): Promise<boolean> {
        let favorito = false;
        const cambiado = await this.guardarMeta((nota) => ({ favorito: (favorito = !nota.favorito) }));
        if (cambiado) this.ajustarFavoritos(favorito ? 1 : -1);
        return cambiado;
    }

    agregarEtiqueta(etiqueta: string): Promise<boolean> {
        // Comas y corchetes romperían la lista `tags: [a, b]` del frontmatter.
        const limpia = etiqueta.replace(/[,\[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
        return this.guardarMeta((nota) => {
            const repetida = nota.tags.some((t) => t.toLowerCase() === limpia.toLowerCase());
            return !limpia || repetida ? null : { tags: [...nota.tags, limpia] };
        });
    }

    quitarEtiqueta(etiqueta: string): Promise<boolean> {
        return this.guardarMeta((nota) => ({ tags: nota.tags.filter((t) => t !== etiqueta) }));
    }

    async eliminarNotaActiva(): Promise<void> {
        this.cancelarTemporizador();
        await this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota) return;
            this.error.set(null);
            try {
                await this.repo.eliminarNota(nota.id);
            } catch (e) {
                this.error.set(`No se pudo eliminar la nota: ${e}`);
                return;
            }
            this.cancelarTemporizador();
            this.cerrarBorrador();
            this.notaActivaId.set(null);
            await this.refrescar();
            if (nota.favorito) this.ajustarFavoritos(-1);
        });
    }

    async moverNotaActiva(categoriaId: string): Promise<void> {
        if (this.enPapelera()) return;
        if (!(await this.salirDeEdicion())) return;
        await this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota || nota.categoriaId === categoriaId) return;
            this.error.set(null);
            let movida: Note;
            try {
                movida = await this.repo.moverNota(nota.id, categoriaId);
            } catch (e) {
                this.error.set(`No se pudo mover la nota: ${e}`);
                return;
            }
            // En Favoritos la nota sigue en la lista, con otro id; en su categoría deja de estar.
            this.notaActivaId.set(this.enFavoritos() ? movida.id : null);
            await this.refrescar();
            this.avisar(`«${movida.titulo}» se movió a ${this.nombreCategoria(categoriaId)}.`);
        });
    }

    async mostrarEnExplorador(): Promise<void> {
        const nota = this.notaActiva();
        if (!nota) return;
        this.error.set(null);
        try {
            await this.repo.mostrarEnExplorador(nota.id);
        } catch (e) {
            this.error.set(`No se pudo abrir el explorador: ${e}`);
        }
    }

    async restaurarNotaActiva(): Promise<void> {
        await this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota || !this.enPapelera()) return;
            this.error.set(null);
            try {
                const { categoriaId, categoriaRecreada } = await this.repo.restaurarNota(nota.id);
                this.avisar(
                    categoriaRecreada
                        ? `La categoría «${categoriaId}» ya no existía: se volvió a crear y «${nota.titulo}» se restauró en ella.`
                        : `«${nota.titulo}» se restauró en ${this.nombreCategoria(categoriaId)}.`
                );
            } catch (e) {
                this.error.set(`No se pudo restaurar la nota: ${e}`);
                return;
            }
            this.notaActivaId.set(null);
            await this.refrescar();
            // La nota conserva su marca de favorita mientras está en la papelera.
            if (nota.favorito) this.ajustarFavoritos(1);
        });
    }

    async eliminarDefinitivamente(): Promise<void> {
        await this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota || !this.enPapelera()) return;
            this.error.set(null);
            try {
                await this.repo.descartarNota(nota.id);
            } catch (e) {
                this.error.set(`No se pudo eliminar la nota: ${e}`);
                return;
            }
            this.notaActivaId.set(null);
            await this.refrescar();
        });
    }

    async vaciarPapelera(): Promise<void> {
        await this.encolar(async () => {
            this.error.set(null);
            try {
                await this.repo.vaciarPapelera();
            } catch (e) {
                this.error.set(`No se pudo vaciar la papelera: ${e}`);
            }
            // Se relee también si falló: parte del contenido puede haberse borrado.
            await this.refrescar();
        });
    }

    private avisar(mensaje: string): void {
        if (this.temporizadorAviso) clearTimeout(this.temporizadorAviso);
        this.aviso.set(mensaje);
        this.temporizadorAviso = setTimeout(() => this.aviso.set(null), DURACION_AVISO);
    }

    private guardarBorrador(): Promise<boolean> {
        this.cancelarTemporizador();
        return this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota || !this.borrador()) return true;
            const editada = this.conBorrador(nota);
            if (editada.titulo === nota.titulo && editada.contenido === nota.contenido) {
                if (this.estadoGuardado() === 'pendiente') this.estadoGuardado.set('guardado');
                return true;
            }
            return (await this.persistir(editada)) !== null;
        });
    }

    private guardarMeta(cambios: (nota: Note) => Partial<Note> | null): Promise<boolean> {
        this.cancelarTemporizador();
        return this.encolar(async () => {
            const nota = this.notaActiva();
            if (!nota || esTextoPlano(nota) || this.enPapelera()) return false;
            const cambio = cambios(nota);
            if (!cambio) return false;
            return (await this.persistir({ ...this.conBorrador(nota), ...cambio })) !== null;
        });
    }

    private conBorrador(nota: Note): Note {
        const b = this.borrador();
        if (!b) return nota;
        return { ...nota, titulo: b.titulo.trim() || TITULO_POR_DEFECTO, contenido: b.contenido };
    }

    private async persistir(nota: Note): Promise<Note | null> {
        const eraActiva = !nota.rutaArchivo || this.notaActivaId() === nota.id;
        this.estadoGuardado.set('guardando');
        this.error.set(null);

        let guardada: Note;
        try {
            guardada = await this.repo.guardarNota(nota);
        } catch (e) {
            this.estadoGuardado.set('error');
            this.error.set(`No se pudo guardar la nota: ${e}`);
            return null;
        }

        // Guardar solo cambia esta nota: se actualiza en la lista en memoria, sin releer la vista
        // del disco. Del orden se encarga `notasOrdenadas`.
        const esNueva = !this.notas().some((n) => n.id === nota.id);
        this.notas.update((notas) =>
            esNueva ? [guardada, ...notas] : notas.map((n) => (n.id === nota.id ? guardada : n))
        );
        if (eraActiva) this.notaActivaId.set(guardada.id);
        if (!this.categoriaActivaId()) this.categoriaActivaId.set(guardada.categoriaId);
        // Si el usuario siguió escribiendo mientras se guardaba, queda otro guardado en espera.
        this.estadoGuardado.set(this.temporizador ? 'pendiente' : 'guardado');

        if (this.enFavoritos()) this.quitarSiDejoDeSerFavorita(guardada);
        if (esNueva) await this.actualizarCategorias();
        return guardada;
    }

    private quitarSiDejoDeSerFavorita(nota: Note): void {
        if (nota.favorito) return;
        this.notas.update((notas) => notas.filter((n) => n.id !== nota.id));
        this.totalFavoritos.set(this.notas().length);
        if (this.notaActivaId() !== nota.id) return;
        // La nota salió de la vista; lo escrito ya está guardado.
        this.cancelarTemporizador();
        this.cerrarBorrador();
        this.notaActivaId.set(null);
    }

    // Una nota nueva cambia el total de su categoría, y puede hacer aparecer «Sin categoría».
    // Solo se listan las carpetas: no se lee ninguna nota.
    private async actualizarCategorias(): Promise<void> {
        try {
            this.categorias.set(await this.repo.listarCategorias());
        } catch (e) {
            this.error.set(`No se pudo actualizar la lista de categorías: ${e}`);
        }
    }

    // Relee categorías (contadores) y notas de la vista activa sin perder la selección.
    private async refrescar(): Promise<void> {
        try {
            const cats = await this.repo.listarCategorias();
            this.categorias.set(cats);

            let vistaId = this.categoriaActivaId();
            // Sin selección (se eliminó la categoría activa) no se elige otra por el usuario.
            if (vistaId && !this.esVista(vistaId) && !cats.some((c) => c.id === vistaId)) {
                vistaId = cats[0]?.id ?? null;
                this.categoriaActivaId.set(vistaId);
            }

            const notas = vistaId ? await this.listarVista(vistaId) : [];
            this.notas.set(notas);
            if (!notas.some((n) => n.id === this.notaActivaId())) {
                // La nota salió de la vista (p. ej. dejó de ser favorita); lo escrito ya está guardado.
                this.cancelarTemporizador();
                this.cerrarBorrador();
                this.notaActivaId.set(null);
            }
        } catch (e) {
            this.error.set(`No se pudo actualizar la lista de notas: ${e}`);
        }
    }

    private esVista(id: string | null): boolean {
        return id === FAVORITOS || id === PAPELERA;
    }

    private async listarVista(id: string): Promise<Note[]> {
        if (id === FAVORITOS) {
            const favoritas = await this.repo.listarFavoritas();
            this.totalFavoritos.set(favoritas.length);
            return favoritas;
        }
        if (id === PAPELERA) return this.repo.listarPapelera();
        return this.repo.listarNotas(id);
    }

    // Recorre todas las carpetas leyendo cada nota: solo al cargar una carpeta raíz. Después el
    // contador se lleva en memoria con ajustarFavoritos().
    private async contarFavoritos(): Promise<void> {
        try {
            this.totalFavoritos.set((await this.repo.listarFavoritas()).length);
        } catch (e) {
            this.error.set(`No se pudieron contar las notas favoritas: ${e}`);
        }
    }

    // En la vista de favoritos no hace falta: el contador sale de la propia lista.
    private ajustarFavoritos(cambio: number): void {
        if (this.enFavoritos()) return;
        this.totalFavoritos.update((total) => Math.max(0, total + cambio));
    }

    private cancelarTemporizador(): void {
        if (this.temporizador) clearTimeout(this.temporizador);
        this.temporizador = null;
    }

    private encolar<T>(tarea: () => Promise<T>): Promise<T> {
        const resultado = this.cola.then(tarea);
        this.cola = resultado.catch(() => undefined);
        return resultado;
    }
}
