import { JSONContent } from '@tiptap/core';
import { docAMarkdown, idaYVueltaSegura, markdownADoc } from './markdown-editor';

const PREGUNTA = '¿Porque aparece este recuadro aquí?';
const TABLA = '| a | b |\n|---|---|\n| 1 | 2 |';

function tipos(markdown: string): string[] {
  return (markdownADoc(markdown).content ?? []).map((n) => n.type ?? '');
}

// Texto de todos los bloques literales del documento.
function literal(doc: JSONContent): string {
  if (doc.type === 'markdownCrudo') return (doc.content ?? []).map((n) => n.text ?? '').join('');
  return (doc.content ?? []).map(literal).join('\n');
}

describe('conversión Markdown del editor', () => {
  it('el texto corriente nunca cae en un bloque literal', () => {
    const textos = [
      PREGUNTA,
      '¡Hola! ¿Qué tal? (bien), "comillas" — guion; 50% #1 @yo a+b=c $5 & <3 1 < 2 > 0 :) ... / \\ | ^ {x}',
      'Precio: 3 * 4 = 12; usa snake_case y [corchetes] sin enlace.',
      'uno\ndos\ntres',
      '# Título\n\nTexto **negrita** y *cursiva*.\n\n- a\n- b\n\n1. c\n2. d',
    ];
    for (const texto of textos) {
      expect(tipos(texto)).not.toContain('markdownCrudo');
      expect(idaYVueltaSegura(texto)).toBeTrue();
    }
  });

  it('solo la sintaxis no representable queda como literal', () => {
    expect(tipos(`${TABLA}\n`)).toEqual(['markdownCrudo']);
    expect(tipos('<div align="center">\n  hola\n</div>\n')).toEqual(['markdownCrudo']);
    expect(tipos('- [ ] tarea\n- [x] hecha\n')).toEqual(['markdownCrudo']);
  });

  it('una imagen o HTML dentro de un párrafo no convierte el párrafo en literal', () => {
    const markdown = `Mira ![img](a.png) y pulsa <kbd>Ctrl</kbd>. ${PREGUNTA}\n`;
    const doc = markdownADoc(markdown);
    expect(doc.content?.map((n) => n.type)).toEqual(['paragraph']);
    const enLinea = doc.content![0].content!.filter((n) => n.type === 'markdownCrudoEnLinea');
    expect(enLinea.map((n) => n.attrs?.['texto'])).toEqual(['![img](a.png)', '<kbd>', '</kbd>']);
    expect(docAMarkdown(doc)).toBe(markdown);
  });

  it('el texto pegado a un bloque literal queda fuera como párrafo', () => {
    const pegados = [`${TABLA}\n${PREGUNTA}\n`, `<div>x</div>\n${PREGUNTA}\n`, `- [ ] tarea\n${PREGUNTA}\n`];
    for (const markdown of pegados) {
      const doc = markdownADoc(markdown);
      expect(doc.content?.map((n) => n.type)).toEqual(['markdownCrudo', 'paragraph']);
      expect(literal(doc)).not.toContain('recuadro');
      expect(idaYVueltaSegura(markdown)).toBeTrue();
    }
    expect(tipos(`![img](a.png)\n${PREGUNTA}\n`)).toEqual(['paragraph']);
  });
});
