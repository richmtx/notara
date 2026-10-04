import { Editor, Extension, JSONContent, Node } from '@tiptap/core';
import { TextSelection, Transaction } from '@tiptap/pm/state';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { Token, marked } from 'marked';

const ETIQUETA_CRUDO = 'Contenido conservado sin formato';
const AYUDA_CRUDO = 'Markdown que el editor no puede mostrar con formato. Se guarda tal cual.';

// Bloques de Markdown que el editor no sabe representar (tablas, HTML, casillas de tarea).
// Se muestran como texto literal y vuelven al archivo exactamente como estaban.
// Sin `priority` propia: el primer nodo de bloque del esquema es el que crea Enter,
// y ese tiene que seguir siendo el párrafo.
export const MarkdownCrudo = Node.create({
    name: 'markdownCrudo',
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,

    parseHTML() {
        // Por delante del bloque de código, que también se pinta como <pre>.
        return [{ tag: 'pre[data-markdown-crudo]', preserveWhitespace: 'full', priority: 60 }];
    },

    renderHTML() {
        const atributos = {
            'data-markdown-crudo': '',
            'data-etiqueta': ETIQUETA_CRUDO,
            title: AYUDA_CRUDO,
            spellcheck: 'false',
        };
        return ['pre', atributos, 0];
    },

    renderMarkdown(nodo: JSONContent) {
        return (nodo.content ?? []).map((n) => n.text ?? '').join('');
    },

    addKeyboardShortcuts() {
        return {
            // Enter en una última línea vacía sale del bloque a un párrafo normal.
            Enter: () => {
                const { $from, empty } = this.editor.state.selection;
                const bloque = $from.parent;
                if (!empty || bloque.type !== this.type) return false;
                if ($from.parentOffset !== bloque.content.size || !bloque.textContent.endsWith('\n')) return false;
                return this.editor.commands.command(({ tr }) => {
                    tr.delete($from.pos - 1, $from.pos);
                    const despues = tr.mapping.map($from.after());
                    tr.insert(despues, this.editor.schema.nodes['paragraph'].create());
                    tr.setSelection(TextSelection.create(tr.doc, despues + 1)).scrollIntoView();
                    return true;
                });
            },
        };
    },
});

// Lo mismo dentro de un párrafo: una imagen o una etiqueta HTML sueltas entre el texto.
export const MarkdownCrudoEnLinea = Node.create({
    name: 'markdownCrudoEnLinea',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            texto: {
                default: '',
                parseHTML: (elemento: HTMLElement) => elemento.textContent ?? '',
                renderHTML: () => ({}),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-markdown-crudo]' }];
    },

    renderHTML({ node }) {
        return ['span', { 'data-markdown-crudo': '', title: AYUDA_CRUDO, spellcheck: 'false' }, node.attrs['texto']];
    },

    renderMarkdown(nodo: JSONContent) {
        return nodo.attrs?.['texto'] ?? '';
    },
});

type TipoLista = 'bulletList' | 'orderedList';

// Parte en párrafos las líneas seleccionadas que comparten párrafo (saltos simples del
// Markdown o Shift+Enter), para que una lista convierta cada línea en su propio ítem.
function separarLineas(tr: Transaction): void {
    const { from, to } = tr.selection;
    const cortes: number[] = [];

    tr.doc.nodesBetween(from, to, (nodo, pos) => {
        if (nodo.type.name !== 'paragraph') return true;
        const saltos: number[] = [];
        nodo.forEach((hijo, desplazamiento) => {
            const inicio = pos + 1 + desplazamiento;
            if (hijo.type.name === 'hardBreak') saltos.push(inicio);
            const texto = hijo.text ?? '';
            for (let i = texto.indexOf('\n'); i !== -1; i = texto.indexOf('\n', i + 1)) saltos.push(inicio + i);
        });
        // Solo los saltos que delimitan las líneas tocadas por la selección.
        const anterior = saltos.filter((s) => s < from).pop() ?? -1;
        const siguiente = saltos.find((s) => s >= to) ?? Infinity;
        cortes.push(...saltos.filter((s) => s >= anterior && s <= siguiente));
        return false;
    });

    for (const corte of cortes.sort((a, b) => b - a)) {
        tr.delete(corte, corte + 1).split(corte);
    }
}

export function alternarLista(editor: Editor, tipo: TipoLista): boolean {
    const cadena = editor.chain().focus();
    if (!editor.isActive('listItem')) {
        cadena.command(({ tr }) => {
            separarLineas(tr);
            return true;
        });
    }
    return (tipo === 'bulletList' ? cadena.toggleBulletList() : cadena.toggleOrderedList()).run();
}

const TeclasDeListas = Extension.create({
    name: 'teclasDeListas',

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-8': () => alternarLista(this.editor, 'bulletList'),
            'Mod-Shift-7': () => alternarLista(this.editor, 'orderedList'),
            // Tab dentro de una lista nunca saca el foco del editor, aunque el ítem no pueda anidarse más.
            Tab: () => {
                if (!this.editor.isActive('listItem')) return false;
                this.editor.commands.sinkListItem('listItem');
                return true;
            },
            'Shift-Tab': () => {
                if (!this.editor.isActive('listItem')) return false;
                this.editor.commands.liftListItem('listItem');
                return true;
            },
        };
    },
});

export const EXTENSIONES_EDITOR = [
    StarterKit.configure({
        // El subrayado no existe en Markdown: se guardaría como HTML.
        underline: false,
        link: { openOnClick: false },
    }),
    MarkdownCrudo,
    MarkdownCrudoEnLinea,
    TeclasDeListas,
];

const conversor = new MarkdownManager({ extensions: EXTENSIONES_EDITOR });

const CONTENEDORES = new Set(['blockquote', 'list', 'list_item']);
const BLOQUES_DE_TEXTO = new Set(['paragraph', 'heading', 'text']);
const BLOQUES_SIMPLES = new Set(['space', 'code', 'hr']);
const EN_LINEA = new Set(['text', 'strong', 'em', 'del', 'codespan', 'br', 'link', 'escape']);

function hijos(token: Token): Token[] {
    return [...(('tokens' in token && token.tokens) || []), ...(('items' in token && token.items) || [])];
}

// Reúne en `crudos` la sintaxis en línea que el editor no representa (imágenes, HTML).
function revisarEnLinea(token: Token, crudos: string[]): void {
    if (EN_LINEA.has(token.type)) hijos(token).forEach((hijo) => revisarEnLinea(hijo, crudos));
    else crudos.push(token.raw);
}

// false = el bloque entero tiene que conservarse como literal.
function revisarBloque(token: Token, crudos: string[]): boolean {
    if (BLOQUES_SIMPLES.has(token.type)) return true;
    if (BLOQUES_DE_TEXTO.has(token.type)) {
        hijos(token).forEach((hijo) => revisarEnLinea(hijo, crudos));
        return true;
    }
    if (!CONTENEDORES.has(token.type)) return false;
    if (token.type === 'list_item' && token.task) return false;
    return hijos(token).every((hijo) => revisarBloque(hijo, crudos));
}

// Líneas de texto corriente que Markdown pega a un bloque literal por no haber una línea
// en blanco entre ambos. No son parte de la tabla, el HTML o la lista de tareas.
const ES_TEXTO_PEGADO: Record<string, (linea: string) => boolean> = {
    table: (linea) => !linea.includes('|'),
    html: (linea) => !/[<>]/.test(linea),
    list: (linea) => !/^\s/.test(linea) && !/^([-*+]|\d+[.)])\s/.test(linea),
};

// Separa ese texto pegado con una línea en blanco, para que se edite como párrafo.
function despegar(markdown: string): string {
    return marked
        .lexer(markdown)
        .map((token) => {
            const esTextoPegado = ES_TEXTO_PEGADO[token.type];
            if (!esTextoPegado || revisarBloque(token, [])) return token.raw;

            const lineas = token.raw.replace(/\s+$/, '').split('\n');
            const pegadas: string[] = [];
            while (lineas.length > 1 && lineas[lineas.length - 1].trim() && esTextoPegado(lineas[lineas.length - 1])) {
                pegadas.unshift(lineas.pop()!);
            }
            if (!pegadas.length) return token.raw;
            return `${lineas.join('\n')}\n\n${despegar(pegadas.join('\n'))}\n\n`;
        })
        .join('');
}

// Caracteres de uso privado: marcan dónde va cada trozo literal mientras se convierte el resto.
const MARCA = /(\d+)/g;

function marcar(bloque: string, crudos: string[], todos: string[]): string | null {
    let resultado = '';
    let cursor = 0;
    for (const crudo of crudos) {
        const en = bloque.indexOf(crudo, cursor);
        if (en === -1) return null;
        resultado += `${bloque.slice(cursor, en)}${todos.push(crudo) - 1}`;
        cursor = en + crudo.length;
    }
    return resultado + bloque.slice(cursor);
}

function restaurar(nodos: JSONContent[], todos: string[]): JSONContent[] {
    return nodos.flatMap((nodo): JSONContent[] => {
        if (nodo.content) return [{ ...nodo, content: restaurar(nodo.content, todos) }];
        if (nodo.type !== 'text' || !nodo.text) return [nodo];

        const partes: JSONContent[] = [];
        let cursor = 0;
        for (const marca of nodo.text.matchAll(MARCA)) {
            if (marca.index > cursor) partes.push({ ...nodo, text: nodo.text.slice(cursor, marca.index) });
            partes.push({ type: 'markdownCrudoEnLinea', attrs: { texto: todos[Number(marca[1])] } });
            cursor = marca.index + marca[0].length;
        }
        if (cursor < nodo.text.length) partes.push({ ...nodo, text: nodo.text.slice(cursor) });
        return partes;
    });
}

export function markdownADoc(markdown: string): JSONContent {
    const contenido: JSONContent[] = [];
    const todos: string[] = [];
    let tramo = '';

    const volcarTramo = () => {
        const texto = tramo.replace(/^\n+|\s+$/g, '');
        tramo = '';
        if (texto) contenido.push(...restaurar(conversor.parse(texto).content ?? [], todos));
    };

    for (const token of marked.lexer(despegar(markdown.replace(/\r\n/g, '\n')))) {
        const crudos: string[] = [];
        const marcado = revisarBloque(token, crudos) ? marcar(token.raw, crudos, todos) : null;
        if (marcado !== null) {
            tramo += marcado;
            continue;
        }
        volcarTramo();
        const crudo = token.raw.replace(/\s+$/, '');
        if (crudo) contenido.push({ type: 'markdownCrudo', content: [{ type: 'text', text: crudo }] });
    }
    volcarTramo();

    return { type: 'doc', content: contenido.length ? contenido : [{ type: 'paragraph' }] };
}

export function docAMarkdown(doc: JSONContent): string {
    const markdown = conversor.serialize(doc).replace(/\s+$/, '');
    return markdown ? `${markdown}\n` : '';
}

function htmlNormalizado(markdown: string): string {
    return (marked.parse(markdown, { async: false }) as string)
        .replace(/\s+/g, ' ')
        .replace(/ ?(<[^>]+>) ?/g, '$1')
        // Una lista con líneas en blanco entre ítems se guarda compacta: mismo contenido.
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '¶')
        .replace(/¶(?=<\/li>|<ul>|<ol)/g, '')
        .trim();
}

// El editor enriquecido solo se usa si cargar y volver a guardar la nota produce un
// Markdown que se lee igual que el original. Si no, la nota se edita como texto.
export function idaYVueltaSegura(markdown: string): boolean {
    try {
        const original = despegar(markdown.replace(/\r\n/g, '\n'));
        return htmlNormalizado(original) === htmlNormalizado(docAMarkdown(markdownADoc(markdown)));
    } catch {
        return false;
    }
}
