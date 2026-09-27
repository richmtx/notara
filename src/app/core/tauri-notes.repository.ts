import { Injectable, inject } from '@angular/core';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { NotesRepository } from './notes.repository';
import { SettingsService } from './settings.service';
import { parsearFrontmatter } from './frontmatter';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

const EXTENSIONES = ['.md', '.txt'];
const SIN_CATEGORIA = '__sin_categoria__';

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

    async guardarNota(_nota: Note): Promise<void> {
        throw new Error('La escritura llega en la fase 2');
    }

    async eliminarNota(_id: string): Promise<void> {
        throw new Error('La eliminación llega en la fase 2');
    }

    private async leerNota(ruta: string, nombre: string, categoriaId: string): Promise<Note> {
        const texto = await readTextFile(ruta);
        const { meta, contenido } = parsearFrontmatter(texto);
        const sinExtension = nombre.replace(/\.(md|txt)$/i, '');

        return {
            id: ruta,
            titulo: meta.titulo ?? sinExtension,
            contenido,
            categoriaId,
            tags: meta.tags,
            favorito: meta.favorito,
            editadaEn: new Date(),
            rutaArchivo: ruta,
        };
    }
}