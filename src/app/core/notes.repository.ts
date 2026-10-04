import { InjectionToken } from '@angular/core';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

export interface NotesRepository {
    listarCategorias(): Promise<Category[]>;
    listarNotas(categoriaId: string): Promise<Note[]>;
    obtenerNota(id: string): Promise<Note | null>;
    // Una nota sin rutaArchivo se crea. Devuelve la nota tal como quedó en disco:
    // su id puede cambiar si el título renombra el archivo.
    guardarNota(nota: Note): Promise<Note>;
    eliminarNota(id: string): Promise<void>;
    // Borra la nota de forma definitiva, sin pasar por la papelera.
    descartarNota(id: string): Promise<void>;
}

export const NOTES_REPOSITORY = new InjectionToken<NotesRepository>('NotesRepository');