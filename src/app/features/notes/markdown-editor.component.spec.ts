import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor } from '@tiptap/core';
import { MarkdownEditorComponent } from './markdown-editor.component';

describe('MarkdownEditorComponent', () => {
  let fixture: ComponentFixture<MarkdownEditorComponent>;
  let emitidos: string[];
  let fallos: string[];

  async function montar(markdown: string): Promise<Editor> {
    fixture = TestBed.createComponent(MarkdownEditorComponent);
    fixture.componentRef.setInput('contenido', markdown);
    emitidos = [];
    fallos = [];
    fixture.componentInstance.cambio.subscribe((m) => emitidos.push(m));
    fixture.componentInstance.fallo.subscribe((m) => fallos.push(m));
    fixture.detectChanges();
    await fixture.whenStable();
    return (fixture.componentInstance as unknown as { editor: Editor }).editor;
  }

  const ultimo = () => emitidos[emitidos.length - 1];
  const boton = (etiqueta: string) =>
    fixture.nativeElement.querySelector(`button[aria-label="${etiqueta}"]`) as HTMLButtonElement;

  function escribirLineas(editor: Editor, lineas: string[], salto: string): void {
    editor.commands.focus('end');
    lineas.forEach((linea, i) => {
      if (i) editor.commands.keyboardShortcut(salto);
      editor.commands.insertContent(linea);
    });
  }

  afterEach(() => fixture.destroy());

  it('abrir una nota no emite cambios', async () => {
    const editor = await montar('# Hola\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] tarea\n\nVer ![img](a.png)\n');
    expect(editor).toBeTruthy();
    expect(fallos).toEqual([]);
    expect(emitidos).toEqual([]);
  });

  it('activa el corrector ortográfico', async () => {
    const editor = await montar('');
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('true');
  });

  it('guarda negrita y cursiva como Markdown', async () => {
    const editor = await montar('hola mundo\n');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    editor.commands.keyboardShortcut('Mod-b');
    expect(ultimo()).toBe('**hola** mundo\n');
    editor.commands.setTextSelection({ from: 6, to: 11 });
    editor.commands.keyboardShortcut('Mod-i');
    expect(ultimo()).toBe('**hola** *mundo*\n');
  });

  it('continúa la lista con Enter y sale de ella en un ítem vacío', async () => {
    const editor = await montar('- uno\n');
    editor.commands.focus('end');
    editor.commands.keyboardShortcut('Enter');
    editor.commands.insertContent('dos');
    expect(ultimo()).toBe('- uno\n- dos\n');
    editor.commands.keyboardShortcut('Enter');
    editor.commands.keyboardShortcut('Enter');
    expect(editor.isActive('listItem')).toBeFalse();
    editor.commands.insertContent('fuera');
    expect(ultimo()).toBe('- uno\n- dos\n\nfuera\n');
  });

  it('anida con Tab y desanida con Shift+Tab', async () => {
    const editor = await montar('1. uno\n2. dos\n');
    editor.commands.focus('end');
    editor.commands.keyboardShortcut('Tab');
    expect(ultimo()).toBe('1. uno\n   1. dos\n');
    editor.commands.keyboardShortcut('Shift-Tab');
    expect(ultimo()).toBe('1. uno\n2. dos\n');
  });

  it('Enter crea párrafos y la lista convierte cada uno en un ítem', async () => {
    const editor = await montar('');
    escribirLineas(editor, ['uno', 'dos', 'tres'], 'Enter');
    expect(ultimo()).toBe('uno\n\ndos\n\ntres\n');
    editor.commands.selectAll();
    boton('Lista con viñetas').click();
    expect(ultimo()).toBe('- uno\n- dos\n- tres\n');
  });

  it('la lista separa en ítems las líneas de un párrafo con saltos simples', async () => {
    const editor = await montar('uno\ndos\ntres\n');
    editor.commands.selectAll();
    boton('Lista numerada').click();
    expect(ultimo()).toBe('1. uno\n2. dos\n3. tres\n');
  });

  it('la lista separa en ítems las líneas unidas con Shift+Enter', async () => {
    const editor = await montar('');
    escribirLineas(editor, ['uno', 'dos', 'tres'], 'Shift-Enter');
    expect(ultimo()).toBe('uno  \ndos  \ntres\n');
    editor.commands.selectAll();
    boton('Lista con viñetas').click();
    expect(ultimo()).toBe('- uno\n- dos\n- tres\n');
  });

  it('solo convierte en ítems las líneas seleccionadas', async () => {
    const editor = await montar('uno\ndos\ntres\n');
    editor.commands.setTextSelection(6);
    boton('Lista con viñetas').click();
    expect(ultimo()).toBe('uno\n\n- dos\n\ntres\n');
  });

  it('conserva el Markdown que no soporta al editar el resto', async () => {
    const tabla = '| a | b |\n|---|---|\n| 1 | 2 |';
    const editor = await montar(`Antes\n\n${tabla}\n\nVer ![img](a.png) y <kbd>Ctrl</kbd>\n`);
    editor.commands.focus('start');
    editor.commands.insertContent('X');
    expect(ultimo()).toBe(`XAntes\n\n${tabla}\n\nVer ![img](a.png) y <kbd>Ctrl</kbd>\n`);
  });

  it('un párrafo con puntuación variada se edita como párrafo normal', async () => {
    const texto = '¿Porque aparece este recuadro aquí? ¡Vaya! (a, b; c: d) "x" — 50% #1 @yo a+b=c $5 & 1 < 2 > 0 ... / | ^ {y}';
    const editor = await montar(`${texto}\n`);
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual(['paragraph']);
    expect(editor.view.dom.querySelector('[data-markdown-crudo]')).toBeNull();
    expect(editor.getText()).toBe(texto);
  });

  it('el bloque literal lleva una etiqueta que lo explica', async () => {
    const editor = await montar('| a | b |\n|---|---|\n| 1 | 2 |\n');
    const bloque = editor.view.dom.querySelector('pre[data-markdown-crudo]') as HTMLElement;
    expect(bloque.getAttribute('data-etiqueta')).toBe('Contenido conservado sin formato');
    expect(getComputedStyle(bloque, '::before').content).toContain('Contenido conservado sin formato');
  });

  it('dos Enter al final del bloque literal salen a un párrafo normal', async () => {
    const tabla = '| a | b |\n|---|---|\n| 1 | 2 |';
    const editor = await montar(`${tabla}\n`);
    // Tecla real: keyboardShortcut() repite los pasos pero descarta la selección resultante.
    const enter = () => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    editor.commands.setTextSelection(1 + tabla.length);
    enter();
    expect(editor.isActive('markdownCrudo')).toBeTrue();
    enter();
    expect(editor.isActive('markdownCrudo')).toBeFalse();
    editor.commands.insertContent('fuera');
    expect(ultimo()).toBe(`${tabla}\n\nfuera\n`);
  });

  it('aplica encabezados desde la barra', async () => {
    const editor = await montar('titulo\n');
    editor.commands.focus('end');
    boton('Encabezado 2').click();
    fixture.detectChanges();
    expect(ultimo()).toBe('## titulo\n');
    expect(boton('Encabezado 2').getAttribute('aria-pressed')).toBe('true');
  });
});
