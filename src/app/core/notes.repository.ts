import { InjectionToken } from '@angular/core';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

export interface NotesRepository {
    listarCategorias(): Promise<Category[]>;
    listarNotas(categoriaId: string): Promise<Note[]>;
    obtenerNota(id: string): Promise<Note | null>;
    guardarNota(nota: Note): Promise<void>;
    eliminarNota(id: string): Promise<void>;
}

export const NOTES_REPOSITORY = new InjectionToken<NotesRepository>('NotesRepository');