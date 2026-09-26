export interface Frontmatter {
    titulo?: string;
    tags: string[];
    favorito: boolean;
}

export interface ArchivoParseado {
    meta: Frontmatter;
    contenido: string;
}

export function parsearFrontmatter(texto: string): ArchivoParseado {
    const vacio: Frontmatter = { tags: [], favorito: false };

    if (!texto.startsWith('---')) {
        return { meta: vacio, contenido: texto };
    }

    const fin = texto.indexOf('\n---', 3);
    if (fin === -1) {
        return { meta: vacio, contenido: texto };
    }

    const bloque = texto.slice(3, fin).trim();
    const contenido = texto.slice(fin + 4).replace(/^\r?\n/, '');
    const meta: Frontmatter = { tags: [], favorito: false };

    for (const linea of bloque.split(/\r?\n/)) {
        const sep = linea.indexOf(':');
        if (sep === -1) continue;

        const clave = linea.slice(0, sep).trim();
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
        }
    }

    return { meta, contenido };
}