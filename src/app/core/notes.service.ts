import { Injectable, inject, signal, computed } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';
import { marked } from 'marked';
import { NOTES_REPOSITORY } from './notes.repository';
import { SettingsService } from './settings.service';
import { idaYVueltaSegura } from './markdown-editor';
import { Note, TITULO_POR_DEFECTO, crearNotaVacia, esTextoPlano } from '../models/note.model';
import { Category, SIN_CATEGORIA } from '../models/category.model';

export interface Borrador {
    titulo: string;
    contenido: string;
}

export type EstadoGuardado = 'inactivo' | 'pendiente' | 'guardando' | 'guardado' | 'error';

const ESPERA_AUTOGUARDADO = 800;

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
    // Las escrituras van en serie: guardar puede renombrar el archivo y cambiar el id de la nota.
    private cola: Promise<unknown> = Promise.resolve();

    readonly carpetaRaiz = computed(() => this.settings.carpetaRaiz());

    readonly categoriaActiva = computed(
        () => this.categorias().find((c) => c.id === this.categoriaActivaId()) ?? null
    );

    readonly notaActiva = computed(
        () => this.notas().find((n) => n.id === this.notaActivaId()) ?? null
    );

    readonly notaActivaEsTextoPlano = computed(() => {
        const nota = this.notaActiva();
        return !!nota && esTextoPlano(nota);
    });

    // Las notas llegan ordenadas por fecha de edición. La que se está creando va siempre
    // primero, aunque algún archivo tenga una fecha posterior a la del reloj.
    private readonly notasOrdenadas = computed(() => {
        const notas = this.notas();
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
        await this.settings.cargar();
        if (this.settings.carpetaRaiz()) {
            await this.recargar();
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
            const notas = await this.repo.listarNotas(id);
            this.notas.set(notas);
            this.notaActivaId.set(null);
        } catch (e) {
            this.error.set(`No se pudieron leer las notas: ${e}`);
            this.notas.set([]);
        } finally {
            this.cargando.set(false);
        }
    }

    async seleccionarNota(id: string): Promise<void> {
        if (id === this.notaActivaId()) return;
        if (!(await this.salirDeEdicion())) return;
        this.notaActivaId.set(id);
    }

    async crearNota(): Promise<void> {
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
        });
    }

    editar(): void {
        const nota = this.notaActiva();
        if (!nota || this.borrador()) return;
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

    alternarFavorito(): Promise<boolean> {
        return this.guardarMeta((nota) => ({ favorito: !nota.favorito }));
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
        });
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
            if (!nota || esTextoPlano(nota)) return false;
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

        this.notas.update((notas) =>
            notas.some((n) => n.id === nota.id)
                ? notas.map((n) => (n.id === nota.id ? guardada : n))
                : [guardada, ...notas]
        );
        if (eraActiva) this.notaActivaId.set(guardada.id);
        if (!this.categoriaActivaId()) this.categoriaActivaId.set(guardada.categoriaId);
        // Si el usuario siguió escribiendo mientras se guardaba, queda otro guardado en espera.
        this.estadoGuardado.set(this.temporizador ? 'pendiente' : 'guardado');

        await this.refrescar();
        return guardada;
    }

    // Relee categorías (contadores) y notas de la categoría activa sin perder la selección.
    private async refrescar(): Promise<void> {
        try {
            const cats = await this.repo.listarCategorias();
            this.categorias.set(cats);

            let categoriaId = this.categoriaActivaId();
            if (!cats.some((c) => c.id === categoriaId)) {
                categoriaId = cats[0]?.id ?? null;
                this.categoriaActivaId.set(categoriaId);
            }

            const notas = categoriaId ? await this.repo.listarNotas(categoriaId) : [];
            this.notas.set(notas);
            if (!notas.some((n) => n.id === this.notaActivaId())) {
                this.notaActivaId.set(null);
            }
        } catch (e) {
            this.error.set(`No se pudo actualizar la lista de notas: ${e}`);
        }
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
