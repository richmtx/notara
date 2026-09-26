import { Injectable, inject, signal, computed } from '@angular/core';
import { NOTES_REPOSITORY } from './notes.repository';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class NotesService {
    private repo = inject(NOTES_REPOSITORY);

    readonly categorias = signal<Category[]>([]);
    readonly notas = signal<Note[]>([]);
    readonly categoriaActivaId = signal<string | null>(null);
    readonly notaActivaId = signal<string | null>(null);
    readonly filtroBusqueda = signal('');

    readonly categoriaActiva = computed(() =>
        this.categorias().find((c) => c.id === this.categoriaActivaId()) ?? null
    );

    readonly notaActiva = computed(() =>
        this.notas().find((n) => n.id === this.notaActivaId()) ?? null
    );

    readonly notasFiltradas = computed(() => {
        const q = this.filtroBusqueda().trim().toLowerCase();
        if (!q) return this.notas();
        return this.notas().filter(
            (n) =>
                n.titulo.toLowerCase().includes(q) ||
                n.contenido.toLowerCase().includes(q)
        );
    });

    async inicializar(): Promise<void> {
        const cats = await this.repo.listarCategorias();
        this.categorias.set(cats);
        if (cats.length) await this.seleccionarCategoria(cats[0].id);
    }

    async seleccionarCategoria(id: string): Promise<void> {
        this.categoriaActivaId.set(id);
        this.filtroBusqueda.set('');
        const notas = await this.repo.listarNotas(id);
        this.notas.set(notas);
        this.notaActivaId.set(notas.length ? notas[0].id : null);
    }

    seleccionarNota(id: string): void {
        this.notaActivaId.set(id);
    }
}