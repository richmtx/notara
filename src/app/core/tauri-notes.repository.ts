import { Injectable, inject } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { exists, mkdir, readDir, readTextFile, remove, rename, stat, watch, writeTextFile } from '@tauri-apps/plugin-fs';
import { CambioExterno, ContenidoCategoria, EliminacionCategoria, NotesRepository, Restauracion } from './notes.repository';
import { SettingsService } from './settings.service';
import { parsearFrontmatter, sanearNombreArchivo, serializarFrontmatter } from './frontmatter';
import { Note } from '../models/note.model';
import { Category, SIN_CATEGORIA } from '../models/category.model';

const EXTENSIONES = ['.md', '.txt'];
const PAPELERA = '.papelera';
// El watcher agrupa los eventos de este intervalo: un guardado (temporal, renombrado, fecha de
// creación) llega como una sola ráfaga, cuando ya terminó.
const ESPERA_WATCHER = 300;

const esNota = (nombre: string) => EXTENSIONES.some((ext) => nombre.toLowerCase().endsWith(ext));

// Qué puede significar para Notara un cambio en esa ruta de la carpeta raíz: una nota (suelta o
// dentro de la carpeta de una categoría), una posible carpeta de categoría, o nada (null).
export function clasificarRuta(ruta: string, raiz: string): 'nota' | 'carpeta' | null {
    const base = `${raiz.replace(/[\\/]+$/, '')}\\`;
    if (!ruta.toLowerCase().startsWith(base.toLowerCase())) return null;
    const partes = ruta.slice(base.length).split(/[\\/]/).filter(Boolean);
    // Más abajo de categoría\nota no hay nada que la app gestione.
    if (!partes.length || partes.length > 2) return null;
    // La papelera, y cualquier otra carpeta oculta: sus movimientos son internos.
    if (partes[0].startsWith('.')) return null;
    const nombre = partes[partes.length - 1];
    // Temporales de los guardados de la propia app.
    if (nombre.toLowerCase().endsWith('.tmp')) return null;
    if (esNota(nombre)) return 'nota';
    return partes.length === 1 ? 'carpeta' : null;
}

@Injectable()
export class TauriNotesRepository implements NotesRepository {
    private settings = inject(SettingsService);
    private cache = new Map<string, Note>();

    // Para distinguir los cambios externos de los propios. De cada nota que la app lee o escribe
    // se guarda su huella (fecha de modificación y tamaño), y de cada categoría, su carpeta. Un
    // aviso del watcher solo cuenta como cambio externo si el disco ya no coincide con esto.
    private huellas = new Map<string, string>();
    private carpetas = new Set<string>();
    private pendientes = new Set<string>();

    private get raiz(): string | null {
        return this.settings.carpetaRaiz();
    }

    async listarCategorias(): Promise<Category[]> {
        const raiz = this.raiz;
        if (!raiz) return [];

        const entradas = await readDir(raiz);
        const categorias: Category[] = [];

        const sueltos = entradas.filter(
            (e) => e.isFile && EXTENSIONES.some((ext) => e.name.toLowerCase().endsWith(ext))
        );
        if (sueltos.length) {
            categorias.push({
                id: SIN_CATEGORIA,
                nombre: 'Sin categoría',
                icono: 'inbox',
                carpeta: '',
                total: sueltos.length,
            });
        }

        for (const entrada of entradas) {
            if (!entrada.isDirectory) continue;
            if (entrada.name.startsWith('.')) continue;

            let total = 0;
            try {
                const hijos = await readDir(`${raiz}\\${entrada.name}`);
                total = hijos.filter(
                    (h) => h.isFile && EXTENSIONES.some((ext) => h.name.toLowerCase().endsWith(ext))
                ).length;
            } catch {
                total = 0;
            }

            categorias.push({
                id: entrada.name,
                nombre: entrada.name,
                icono: 'folder',
                carpeta: entrada.name,
                total,
            });
        }

        this.carpetas = new Set(categorias.filter((c) => c.carpeta).map((c) => c.carpeta.toLowerCase()));
        return categorias;
    }

    async crearCategoria(nombre: string): Promise<Category> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const ruta = `${raiz}\\${nombre}`;
        if (await exists(ruta)) throw new Error(`Ya existe una carpeta llamada «${nombre}»`);
        await mkdir(ruta);
        this.carpetas.add(nombre.toLowerCase());
        return { id: nombre, nombre, icono: 'folder', carpeta: nombre, total: 0 };
    }

    async contenidoCategoria(id: string): Promise<ContenidoCategoria> {
        const { notas, ajenos } = await this.leerContenido(this.carpetaDeCategoria(id));
        return { notas: notas.length, ajenos };
    }

    async eliminarCategoria(id: string): Promise<EliminacionCategoria> {
        const carpeta = this.carpetaDeCategoria(id);
        const { notas, ajenos } = await this.leerContenido(carpeta);
        if (ajenos.length) return { eliminada: false, movidas: 0, pendientes: notas.length, ajenos };

        let movidas = 0;
        try {
            for (const nombre of notas) {
                await this.eliminarNota(`${carpeta}\\${nombre}`);
                movidas++;
            }
            // Sin `recursive`: si entre tanto apareció algo en la carpeta, el borrado falla en
            // vez de llevárselo por delante.
            await remove(carpeta);
        } catch (e) {
            return { eliminada: false, movidas, pendientes: notas.length - movidas, ajenos: [], motivo: `${e}` };
        }
        this.carpetas.delete(id.toLowerCase());
        return { eliminada: true, movidas, pendientes: 0, ajenos: [] };
    }

    // Solo carpetas de categoría: ni la raíz («Sin categoría»), ni la papelera, ni rutas compuestas.
    private carpetaDeCategoria(id: string): string {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');
        if (!id || id === SIN_CATEGORIA || id.startsWith('.') || /[\\/]/.test(id)) {
            throw new Error(`«${id}» no es una categoría`);
        }
        return `${raiz}\\${id}`;
    }

    private async leerContenido(carpeta: string): Promise<{ notas: string[]; ajenos: string[] }> {
        const notas: string[] = [];
        const ajenos: string[] = [];
        for (const entrada of await readDir(carpeta)) {
            const esNota = entrada.isFile && EXTENSIONES.some((ext) => entrada.name.toLowerCase().endsWith(ext));
            (esNota ? notas : ajenos).push(entrada.name);
        }
        return { notas, ajenos };
    }

    async listarNotas(categoriaId: string): Promise<Note[]> {
        const raiz = this.raiz;
        if (!raiz) return [];

        const carpeta = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;
        return this.porFechaEdicion(await this.leerCarpeta(carpeta, categoriaId));
    }

    async listarTodas(): Promise<Note[]> {
        const todas: Note[] = [];
        for (const categoria of await this.listarCategorias()) {
            todas.push(...(await this.listarNotas(categoria.id)));
        }
        return this.porFechaEdicion(todas);
    }

    async listarFavoritas(): Promise<Note[]> {
        return (await this.listarTodas()).filter((n) => n.favorito);
    }

    private porFechaEdicion(notas: Note[]): Note[] {
        return notas.sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
    }

    private async leerCarpeta(carpeta: string, categoriaId: string): Promise<Note[]> {
        const notas: Note[] = [];
        for (const entrada of await readDir(carpeta)) {
            if (!entrada.isFile) continue;
            const nombre = entrada.name;
            if (!EXTENSIONES.some((ext) => nombre.toLowerCase().endsWith(ext))) continue;

            const nota = await this.leerNota(`${carpeta}\\${nombre}`, nombre, categoriaId);
            this.cache.set(nota.id, nota);
            notas.push(nota);
        }
        return notas;
    }

    async obtenerNota(id: string): Promise<Note | null> {
        return this.cache.get(id) ?? null;
    }

    async guardarNota(nota: Note): Promise<Note> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const esNueva = !nota.rutaArchivo;
        let ruta = nota.rutaArchivo;
        let renombrarA: string | null = null;

        if (esNueva) {
            const carpeta = nota.categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${nota.categoriaId}`;
            ruta = await this.rutaLibre(carpeta, sanearNombreArchivo(nota.titulo), '.md');
        } else if (await this.cambioSinRevisar(ruta)) {
            // El watcher avisa con retraso: el archivo puede haber cambiado por fuera sin que la
            // app lo sepa todavía. No se escribe encima; el cambio queda pendiente de revisar
            // para que el usuario decida qué versión conservar.
            this.pendientes.add(ruta);
            throw new Error('el archivo cambió fuera de Notara y no se sobrescribió');
        } else if (this.cache.get(nota.id)?.titulo !== nota.titulo) {
            const { carpeta, extension } = this.partes(ruta);
            const destino = await this.rutaLibre(carpeta, sanearNombreArchivo(nota.titulo), extension, ruta);
            if (destino !== ruta) renombrarA = destino;
        }

        const esTxt = ruta.toLowerCase().endsWith('.txt');
        let texto = nota.contenido;
        if (!esTxt) {
            const meta = { titulo: nota.titulo, tags: nota.tags, favorito: nota.favorito };
            texto = serializarFrontmatter(meta, nota.contenido, esNueva ? [] : await this.otrasLineas(ruta));
        }

        // Primero el contenido y después el nombre: si el renombrado falla, lo escrito ya está a salvo.
        await this.escribirSeguro(ruta, texto);
        if (renombrarA) {
            // Si el renombrado falla, que conste que lo escrito en la ruta de siempre es de la app.
            await this.fechas(ruta);
            await rename(ruta, renombrarA);
            ruta = renombrarA;
        }

        const guardada: Note = {
            ...nota,
            id: ruta,
            rutaArchivo: ruta,
            tags: esTxt ? [] : nota.tags,
            favorito: esTxt ? false : nota.favorito,
            ...(await this.fechas(ruta)),
        };
        this.olvidar(nota.id);
        this.cache.set(guardada.id, guardada);
        return guardada;
    }

    async eliminarNota(id: string): Promise<void> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        // La papelera replica las carpetas de origen (.papelera\<categoría>\nota.md; las notas sueltas
        // van directas a .papelera). La ubicación del archivo dice de dónde venía, sin un índice
        // aparte que mantener sincronizado.
        const papelera = `${raiz}\\${PAPELERA}`;
        const origen = this.categoriaDe(id, raiz);
        const destino = origen === SIN_CATEGORIA ? papelera : `${papelera}\\${origen}`;
        await mkdir(destino, { recursive: true });

        const { base, extension } = this.partes(id);
        await rename(id, await this.rutaLibre(destino, base, extension));
        this.olvidar(id);
    }

    async descartarNota(id: string): Promise<void> {
        await remove(id);
        this.olvidar(id);
        await this.quitarCarpetaDePapeleraVacia(this.partes(id).carpeta);
    }

    async listarPapelera(): Promise<Note[]> {
        const raiz = this.raiz;
        if (!raiz) return [];

        const papelera = `${raiz}\\${PAPELERA}`;
        if (!(await exists(papelera))) return [];

        const notas = await this.leerCarpeta(papelera, SIN_CATEGORIA);
        for (const entrada of await readDir(papelera)) {
            if (!entrada.isDirectory) continue;
            notas.push(...(await this.leerCarpeta(`${papelera}\\${entrada.name}`, entrada.name)));
        }
        return this.porFechaEdicion(notas);
    }

    async restaurarNota(id: string): Promise<Restauracion> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        // La subcarpeta de la papelera dice de qué categoría venía la nota; las del nivel superior
        // eran notas sueltas y vuelven a la raíz.
        const categoriaId = this.categoriaDe(id, `${raiz}\\${PAPELERA}`);
        const destino = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;
        const categoriaRecreada = !(await exists(destino));
        if (categoriaRecreada) {
            await mkdir(destino);
            this.carpetas.add(categoriaId.toLowerCase());
        }

        const { carpeta, base, extension } = this.partes(id);
        const restaurada = await this.rutaLibre(destino, base, extension);
        await rename(id, restaurada);
        this.olvidar(id);
        // Deja anotada la huella del archivo en su nueva ruta: lo puso ahí la app.
        await this.fechas(restaurada);
        await this.quitarCarpetaDePapeleraVacia(carpeta);
        return { categoriaId, categoriaRecreada };
    }

    async vaciarPapelera(): Promise<void> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const papelera = `${raiz}\\${PAPELERA}`;
        if (await exists(papelera)) await remove(papelera, { recursive: true });
    }

    async moverNota(id: string, categoriaId: string): Promise<Note> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const destino = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;
        const { base, extension } = this.partes(id);
        const ruta = await this.rutaLibre(destino, base, extension);
        await rename(id, ruta);
        this.olvidar(id);

        const nota = await this.leerNota(ruta, ruta.slice(ruta.lastIndexOf('\\') + 1), categoriaId);
        this.cache.set(nota.id, nota);
        return nota;
    }

    async mostrarEnExplorador(id: string): Promise<void> {
        await revealItemInDir(id);
    }

    async vigilar(alDetectar: () => void): Promise<() => void> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        // Lo anotado era de la carpeta raíz anterior.
        this.pendientes.clear();
        this.huellas.clear();
        return watch(
            raiz,
            (evento) => {
                // Leer un archivo no lo cambia.
                if (typeof evento.type === 'object' && 'access' in evento.type) return;
                const rutas = evento.paths
                    // Windows puede dar la ruta en su forma extendida (\\?\C:\...).
                    .map((ruta) => ruta.replace(/^\\\\\?\\/, ''))
                    .filter((ruta) => clasificarRuta(ruta, raiz));
                if (!rutas.length) return;
                rutas.forEach((ruta) => this.pendientes.add(ruta));
                alDetectar();
            },
            { recursive: true, delayMs: ESPERA_WATCHER }
        );
    }

    async cambiosExternos(): Promise<CambioExterno> {
        const cambio: CambioExterno = { notas: [], carpetas: false };
        const raiz = this.raiz;
        const rutas = [...this.pendientes];
        this.pendientes.clear();
        if (!raiz) return cambio;

        for (const ruta of rutas) {
            const info = await stat(ruta).catch(() => null);
            const clave = ruta.toLowerCase();

            if (clasificarRuta(ruta, raiz) === 'nota') {
                const actual = info?.isFile ? this.huella(info) : undefined;
                // Coincide con lo que la app leyó o escribió (o no existe ni se la esperaba): el
                // aviso venía de un guardado, un renombrado o un borrado propios.
                if (this.huellas.get(clave) === actual) continue;
                // Anotado, para dar cada cambio una sola vez.
                if (actual) this.huellas.set(clave, actual);
                else this.huellas.delete(clave);
                cambio.notas.push({ id: ruta, categoriaId: this.categoriaDe(ruta, raiz) });
            } else {
                const nombre = ruta.slice(ruta.lastIndexOf('\\') + 1).toLowerCase();
                const existe = !!info?.isDirectory;
                if (existe === this.carpetas.has(nombre)) continue;
                if (existe) this.carpetas.add(nombre);
                else this.carpetas.delete(nombre);
                cambio.carpetas = true;
            }
        }
        return cambio;
    }

    // El archivo ya no está como la app lo leyó o lo escribió por última vez.
    private async cambioSinRevisar(ruta: string): Promise<boolean> {
        const conocida = this.huellas.get(ruta.toLowerCase());
        if (!conocida) return false;
        const info = await stat(ruta).catch(() => null);
        return (info?.isFile ? this.huella(info) : undefined) !== conocida;
    }

    private huella(info: { mtime: Date | null; size: number }): string {
        return `${info.mtime?.getTime()}:${info.size}`;
    }

    // La nota deja de estar en esa ruta porque la app la movió, la renombró o la borró.
    private olvidar(id: string): void {
        this.cache.delete(id);
        this.huellas.delete(id.toLowerCase());
    }

    // Categoría a la que corresponde un archivo según su carpeta: directamente en `base` es una
    // nota suelta; en una subcarpeta, la categoría es el nombre de esa subcarpeta.
    private categoriaDe(ruta: string, base: string): string {
        const { carpeta } = this.partes(ruta);
        if (carpeta.toLowerCase() === base.toLowerCase()) return SIN_CATEGORIA;
        return carpeta.slice(carpeta.lastIndexOf('\\') + 1);
    }

    // Tras sacar una nota de la papelera, retira la subcarpeta de su categoría si quedó vacía.
    // Es solo limpieza: si falla, la carpeta vacía se queda y no afecta a ninguna nota.
    private async quitarCarpetaDePapeleraVacia(carpeta: string): Promise<void> {
        const papelera = `${this.raiz}\\${PAPELERA}`.toLowerCase();
        if (!carpeta.toLowerCase().startsWith(`${papelera}\\`)) return;
        try {
            if ((await readDir(carpeta)).length === 0) await remove(carpeta);
        } catch {
            // Sin consecuencias: ver el comentario de arriba.
        }
    }

    // Nunca se escribe sobre el original: un fallo a medio guardado solo afecta al temporal.
    private async escribirSeguro(ruta: string, texto: string): Promise<void> {
        const temporal = `${ruta}.tmp`;
        const creadaEn = (await exists(ruta)) ? (await this.fechas(ruta)).creadaEn : null;
        try {
            await writeTextFile(temporal, texto);
            await rename(temporal, ruta);
        } catch (e) {
            await remove(temporal).catch(() => undefined);
            throw e;
        }
        // El archivo que queda es el temporal renombrado, que acaba de nacer: sin esto, cada
        // guardado reiniciaría la fecha de creación y ordenar por ella sería ordenar por edición.
        if (creadaEn) {
            await invoke('conservar_fecha_creacion', { ruta, creadaMs: creadaEn.getTime() });
        }
    }

    private async otrasLineas(ruta: string): Promise<string[]> {
        try {
            return parsearFrontmatter(await readTextFile(ruta)).otros;
        } catch {
            return [];
        }
    }

    // Primera ruta disponible en la carpeta, agregando sufijo numérico si el nombre ya existe.
    // `actual` es la ruta del propio archivo, que no cuenta como colisión.
    private async rutaLibre(carpeta: string, base: string, extension: string, actual?: string): Promise<string> {
        for (let n = 1; ; n++) {
            const candidata = `${carpeta}\\${n === 1 ? base : `${base}-${n}`}${extension}`;
            if (actual && candidata.toLowerCase() === actual.toLowerCase()) return candidata;
            if (!(await exists(candidata))) return candidata;
        }
    }

    private partes(ruta: string): { carpeta: string; base: string; extension: string } {
        const corte = ruta.lastIndexOf('\\');
        const nombre = ruta.slice(corte + 1);
        const punto = nombre.lastIndexOf('.');
        return {
            carpeta: ruta.slice(0, corte),
            base: punto > 0 ? nombre.slice(0, punto) : nombre,
            extension: punto > 0 ? nombre.slice(punto) : '',
        };
    }

    // Fechas de modificación y de creación del archivo según el sistema de archivos. De paso
    // anota su huella: es el estado del archivo que la app conoce.
    private async fechas(ruta: string): Promise<{ editadaEn: Date; creadaEn: Date }> {
        const info = await stat(ruta);
        const { mtime, birthtime } = info;
        if (!mtime) throw new Error(`El sistema de archivos no informa la fecha de modificación de ${ruta}`);
        this.huellas.set(ruta.toLowerCase(), this.huella(info));
        // No todos los sistemas de archivos registran la creación; la edición es lo más parecido.
        return { editadaEn: mtime, creadaEn: birthtime ?? mtime };
    }

    private async leerNota(ruta: string, nombre: string, categoriaId: string): Promise<Note> {
        const [texto, fechas] = await Promise.all([readTextFile(ruta), this.fechas(ruta)]);
        const { meta, contenido } = parsearFrontmatter(texto);
        const sinExtension = nombre.replace(/\.(md|txt)$/i, '');

        return {
            id: ruta,
            titulo: meta.titulo || sinExtension,
            contenido,
            categoriaId,
            tags: meta.tags,
            favorito: meta.favorito,
            ...fechas,
            rutaArchivo: ruta,
        };
    }
}