import { Injectable, inject, signal, computed } from '@angular/core';
import { open } from '@tauri-apps/plugin-dialog';
import { marked } from 'marked';
import { NOTES_REPOSITORY } from './notes.repository';
import { SettingsService } from './settings.service';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

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

    readonly carpetaRaiz = computed(() => this.settings.carpetaRaiz());

    readonly categoriaActiva = computed(
        () => this.categorias().find((c) => c.id === this.categoriaActivaId()) ?? null
    );

    readonly notaActiva = computed(
        () => this.notas().find((n) => n.id === this.notaActivaId()) ?? null
    );

    readonly notasFiltradas = computed(() => {
        const q = this.filtroBusqueda().trim().toLowerCase();
        if (!q) return this.notas();
        return this.notas().filter(
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
        this.categoriaActivaId.set(id);
        this.filtroBusqueda.set('');
        this.cargando.set(true);
        try {
            const notas = await this.repo.listarNotas(id);
            this.notas.set(notas);
            this.notaActivaId.set(notas.length ? notas[0].id : null);
        } catch (e) {
            this.error.set(`No se pudieron leer las notas: ${e}`);
            this.notas.set([]);
        } finally {
            this.cargando.set(false);
        }
    }

    seleccionarNota(id: string): void {
        this.notaActivaId.set(id);
    }
}