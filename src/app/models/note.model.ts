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

export function crearNotaVacia(categoriaId: string): Note {
    return {
        id: crypto.randomUUID(),
        titulo: 'Nota sin título',
        contenido: '',
        categoriaId,
        tags: [],
        favorito: false,
        editadaEn: new Date(),
        rutaArchivo: '',
    };
}