import { InjectionToken } from '@angular/core';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

export interface Restauracion {
    // Categoría donde quedó la nota.
    categoriaId: string;
    // La categoría de origen ya no existía y se volvió a crear para recibir la nota.
    categoriaRecreada: boolean;
}

export interface ContenidoCategoria {
    notas: number;
    // Nombres de lo que hay en la carpeta y Notara no gestiona: subcarpetas, imágenes, otros archivos.
    ajenos: string[];
}

export interface EliminacionCategoria {
    // La carpeta ya no existe.
    eliminada: boolean;
    // Notas que pasaron a la papelera.
    movidas: number;
    // Notas que siguen en la carpeta.
    pendientes: number;
    // Si hay contenido ajeno no se toca nada: ni la carpeta ni sus notas.
    ajenos: string[];
    // Por qué quedó a medias, cuando falló después de empezar.
    motivo?: string;
}

export interface NotesRepository {
    listarCategorias(): Promise<Category[]>;
    // Falla si ya existe una carpeta con ese nombre. El nombre llega ya saneado.
    crearCategoria(nombre: string): Promise<Category>;
    contenidoCategoria(id: string): Promise<ContenidoCategoria>;
    // Mueve las notas de la categoría a la papelera, como eliminarNota, y borra la carpeta.
    // Nunca borra una nota ni nada que no sea una nota. Un resultado a medias no es una
    // excepción: se devuelve para poder contar qué se movió y qué no.
    eliminarCategoria(id: string): Promise<EliminacionCategoria>;
    listarNotas(categoriaId: string): Promise<Note[]>;
    // Notas marcadas como favoritas en cualquier categoría.
    listarFavoritas(): Promise<Note[]>;
    obtenerNota(id: string): Promise<Note | null>;
    // Una nota sin rutaArchivo se crea. Devuelve la nota tal como quedó en disco:
    // su id puede cambiar si el título renombra el archivo.
    guardarNota(nota: Note): Promise<Note>;
    eliminarNota(id: string): Promise<void>;
    // Borra la nota de forma definitiva, sin pasar por la papelera.
    descartarNota(id: string): Promise<void>;
    // Notas de la papelera. Su categoriaId es la categoría de la que venían.
    listarPapelera(): Promise<Note[]>;
    restaurarNota(id: string): Promise<Restauracion>;
    vaciarPapelera(): Promise<void>;
    // Mueve el archivo a la carpeta de otra categoría. Si allí ya hay uno con ese nombre,
    // se le agrega un sufijo numérico. Devuelve la nota con su nuevo id.
    moverNota(id: string, categoriaId: string): Promise<Note>;
    // Abre el explorador de archivos del sistema con el archivo de la nota seleccionado.
    mostrarEnExplorador(id: string): Promise<void>;
}

export const NOTES_REPOSITORY = new InjectionToken<NotesRepository>('NotesRepository');