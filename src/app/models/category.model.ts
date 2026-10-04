export const SIN_CATEGORIA = '__sin_categoria__';
// Vistas que se seleccionan como una categoría pero no son una carpeta de notas.
export const FAVORITOS = '__favoritos__';
export const PAPELERA = '__papelera__';

export interface Category {
    id: string;
    nombre: string;
    icono: string;
    carpeta: string;
    total: number;
}