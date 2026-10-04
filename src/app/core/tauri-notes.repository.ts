import { Injectable, inject } from '@angular/core';
import { exists, mkdir, readDir, readTextFile, remove, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { NotesRepository } from './notes.repository';
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

    async listarNotas(categoriaId: string): Promise<Note[]> {
        const raiz = this.raiz;
        if (!raiz) return [];

        const carpeta = categoriaId === SIN_CATEGORIA ? raiz : `${raiz}\\${categoriaId}`;
        const entradas = await readDir(carpeta);
        const notas: Note[] = [];

        for (const entrada of entradas) {
            if (!entrada.isFile) continue;
            const nombre = entrada.name;
            if (!EXTENSIONES.some((ext) => nombre.toLowerCase().endsWith(ext))) continue;

            const ruta = `${carpeta}\\${nombre}`;
            const nota = await this.leerNota(ruta, nombre, categoriaId);
            this.cache.set(nota.id, nota);
            notas.push(nota);
        }

        return notas.sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
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
            editadaEn: await this.fechaModificacion(ruta),
        };
        this.cache.delete(nota.id);
        this.cache.set(guardada.id, guardada);
        return guardada;
    }

    async eliminarNota(id: string): Promise<void> {
        const raiz = this.raiz;
        if (!raiz) throw new Error('No hay una carpeta de notas configurada');

        const papelera = `${raiz}\\${PAPELERA}`;
        if (!(await exists(papelera))) {
            await mkdir(papelera);
        }

        const { base, extension } = this.partes(id);
        await rename(id, await this.rutaLibre(papelera, base, extension));
        this.cache.delete(id);
    }

    async descartarNota(id: string): Promise<void> {
        await remove(id);
        this.cache.delete(id);
    }

    // Nunca se escribe sobre el original: un fallo a medio guardado solo afecta al temporal.
    private async escribirSeguro(ruta: string, texto: string): Promise<void> {
        const temporal = `${ruta}.tmp`;
        try {
            await writeTextFile(temporal, texto);
            await rename(temporal, ruta);
        } catch (e) {
            await remove(temporal).catch(() => undefined);
            throw e;
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

    // Fecha de modificación del archivo según el sistema de archivos.
    private async fechaModificacion(ruta: string): Promise<Date> {
        const { mtime } = await stat(ruta);
        if (!mtime) throw new Error(`El sistema de archivos no informa la fecha de modificación de ${ruta}`);
        return mtime;
    }

    private async leerNota(ruta: string, nombre: string, categoriaId: string): Promise<Note> {
        const [texto, editadaEn] = await Promise.all([readTextFile(ruta), this.fechaModificacion(ruta)]);
        const { meta, contenido } = parsearFrontmatter(texto);
        const sinExtension = nombre.replace(/\.(md|txt)$/i, '');

        return {
            id: ruta,
            titulo: meta.titulo || sinExtension,
            contenido,
            categoriaId,
            tags: meta.tags,
            favorito: meta.favorito,
            editadaEn,
            rutaArchivo: ruta,
        };
    }
}