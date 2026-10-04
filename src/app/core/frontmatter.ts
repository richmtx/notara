export interface Frontmatter {
    titulo?: string;
    tags: string[];
    favorito: boolean;
}

export interface ArchivoParseado {
    meta: Frontmatter;
    contenido: string;
    // Líneas del frontmatter que Notara no interpreta; se conservan al reescribir.
    otros: string[];
}

export function parsearFrontmatter(texto: string): ArchivoParseado {
    const vacio: Frontmatter = { tags: [], favorito: false };

    if (!texto.startsWith('---')) {
        return { meta: vacio, contenido: texto, otros: [] };
    }

    const fin = texto.indexOf('\n---', 3);
    if (fin === -1) {
        return { meta: vacio, contenido: texto, otros: [] };
    }

    const bloque = texto.slice(3, fin).trim();
    const contenido = texto.slice(fin + 4).replace(/^\r?\n/, '');
    const meta: Frontmatter = { tags: [], favorito: false };
    const otros: string[] = [];

    for (const linea of bloque.split(/\r?\n/)) {
        const sep = linea.indexOf(':');
        const clave = sep === -1 ? '' : linea.slice(0, sep).trim();
        const valor = linea.slice(sep + 1).trim();

        if (clave === 'titulo') {
            meta.titulo = valor;
        } else if (clave === 'favorito') {
            meta.favorito = valor === 'true';
        } else if (clave === 'tags') {
            meta.tags = valor
                .replace(/^\[|\]$/g, '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
        } else if (linea.trim()) {
            otros.push(linea);
        }
    }

    return { meta, contenido, otros };
}

export function serializarFrontmatter(meta: Frontmatter, contenido: string, otros: string[] = []): string {
    const lineas = [
        '---',
        `titulo: ${(meta.titulo ?? '').replace(/[\r\n]+/g, ' ').trim()}`,
        `tags: [${meta.tags.join(', ')}]`,
        `favorito: ${meta.favorito}`,
        ...otros,
        '---',
    ];
    // Sin línea en blanco tras el cierre: el parser solo descarta un salto de línea.
    return `${lineas.join('\n')}\n${contenido}`;
}

const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function quitarNoPermitidos(texto: string): string {
    return texto
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 120)
        // Windows tampoco admite nombres que terminen en punto o espacio.
        .replace(/[. ]+$/, '')
        .trim();
}

export function sanearNombreArchivo(titulo: string): string {
    const nombre = quitarNoPermitidos(titulo);
    if (!nombre) return 'nota-sin-titulo';
    return RESERVADOS.test(nombre) ? `${nombre}-nota` : nombre;
}

// Mismas reglas que los archivos, pero sin nombre de reserva: '' significa que no hay nada que crear.
// Tampoco puede empezar por punto, porque esas carpetas no se listan como categoría.
export function sanearNombreCarpeta(nombre: string): string {
    const limpio = quitarNoPermitidos(nombre.replace(/^[.\s]+/, ''));
    return RESERVADOS.test(limpio) ? `${limpio}-notas` : limpio;
}
