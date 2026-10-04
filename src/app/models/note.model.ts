export interface Note {
    id: string;
    titulo: string;
    contenido: string;
    categoriaId: string;
    tags: string[];
    favorito: boolean;
    editadaEn: Date;
    rutaArchivo: string;
}

export const TITULO_POR_DEFECTO = 'Nota sin título';

// Los .txt se guardan como texto plano: no tienen frontmatter donde vivan tags ni favorito.
export function esTextoPlano(nota: Note): boolean {
    return nota.rutaArchivo.toLowerCase().endsWith('.txt');
}

export function crearNotaVacia(categoriaId: string): Note {
    return {
        id: crypto.randomUUID(),
        titulo: TITULO_POR_DEFECTO,
        contenido: '',
        categoriaId,
        tags: [],
        favorito: false,
        editadaEn: new Date(),
        rutaArchivo: '',
    };
}