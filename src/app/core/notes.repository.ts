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

// Lo que cambió en la carpeta de notas sin que lo hiciera la app.
export interface CambioExterno {
    // Notas creadas, modificadas o eliminadas, con la categoría a la que corresponde su carpeta.
    notas: { id: string; categoriaId: string }[];
    // Apareció o desapareció alguna carpeta de categoría.
    carpetas: boolean;
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
    // Todas las notas de todas las categorías, con su contenido. No incluye la papelera.
    listarTodas(): Promise<Note[]>;
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
    // Vigila la carpeta raíz. `alDetectar` solo dice que algo se movió en el disco, y eso incluye
    // lo que escribe la propia app: qué cambió de verdad por fuera lo responde `cambiosExternos`.
    // Devuelve la función que deja de vigilar.
    vigilar(alDetectar: () => void): Promise<() => void>;
    // Cambios hechos por fuera desde la última consulta. No incluye lo que la app leyó o escribió
    // ella misma, ni nada de la papelera. Debe llamarse sin escrituras de la app en curso.
    cambiosExternos(): Promise<CambioExterno>;
}

export const NOTES_REPOSITORY = new InjectionToken<NotesRepository>('NotesRepository');