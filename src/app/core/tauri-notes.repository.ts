import { Injectable, inject } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { exists, mkdir, readDir, readTextFile, remove, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { NotesRepository, Restauracion } from './notes.repository';
import { SettingsService } from './settings.service';
import { parsearFrontmatter, sanearNombreArchivo, serializarFrontmatter } from './frontmatter';
import { Note } from '../models/note.model';
import { Category, SIN_CATEGORIA } from '../models/category.model';

const EXTENSIONES = ['.md', '.txt'];
const PAPELERA = '.papelera';

@Injectable()
export class TauriNotesRepository implements NotesRepository {
    private settings = inject(SettingsService);
    private cache = new Map<string, Note>();

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

        return categorias;
    }

    async crearCategoria(nombre: string): Promise<Category> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const ruta = `${raiz}\\${nombre}`;
        if (await exists(ruta)) throw new Error(`Ya existe una carpeta llamada «${nombre}»`);
        await mkdir(ruta);
        return { id: nombre, nombre, icono: 'folder', carpeta: nombre, total: 0 };
    }

    async listarNotas(categoriaId: string): Promise<Note[]> {
        const raiz = this.raiz;
        if (!raiz) return [];

        const carpeta = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;
        return this.porFechaEdicion(await this.leerCarpeta(carpeta, categoriaId));
    }

    async listarFavoritas(): Promise<Note[]> {
        const favoritas: Note[] = [];
        for (const categoria of await this.listarCategorias()) {
            const notas = await this.listarNotas(categoria.id);
            favoritas.push(...notas.filter((n) => n.favorito));
        }
        return this.porFechaEdicion(favoritas);
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
        this.cache.delete(nota.id);
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
        this.cache.delete(id);
    }

    async descartarNota(id: string): Promise<void> {
        await remove(id);
        this.cache.delete(id);
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

        const origen = this.categoriaDe(id, `${raiz}\\${PAPELERA}`);
        const existeOrigen = origen === SIN_CATEGORIA || (await exists(`${raiz}\\${origen}`));
        const categoriaId = existeOrigen ? origen : SIN_CATEGORIA;
        const destino = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;

        const { carpeta, base, extension } = this.partes(id);
        await rename(id, await this.rutaLibre(destino, base, extension));
        this.cache.delete(id);
        await this.quitarCarpetaDePapeleraVacia(carpeta);
        return { categoriaId, categoriaPerdida: !existeOrigen };
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
        this.cache.delete(id);

        const nota = await this.leerNota(ruta, ruta.slice(ruta.lastIndexOf('\\') + 1), categoriaId);
        this.cache.set(nota.id, nota);
        return nota;
    }

    async mostrarEnExplorador(id: string): Promise<void> {
        await revealItemInDir(id);
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

    // Fechas de modificación y de creación del archivo según el sistema de archivos.
    private async fechas(ruta: string): Promise<{ editadaEn: Date; creadaEn: Date }> {
        const { mtime, birthtime } = await stat(ruta);
        if (!mtime) throw new Error(`El sistema de archivos no informa la fecha de modificación de ${ruta}`);
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