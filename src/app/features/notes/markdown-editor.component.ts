import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EXTENSIONES_EDITOR, alternarLista, docAMarkdown, markdownADoc } from '../../core/markdown-editor';

interface Control {
  icono: string;
  etiqueta: string;
  atajo?: string;
  activo: () => boolean;
  accion: () => void;
}

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  templateUrl: './markdown-editor.component.html',
  styleUrl: './markdown-editor.component.css',
})
export class MarkdownEditorComponent implements OnDestroy {
  // Markdown inicial: solo se lee al montar. Después manda el editor.
  contenido = input.required<string>();
  autofoco = input(false);
  cambio = output<string>();
  fallo = output<string>();

  private anfitrion = viewChild.required<ElementRef<HTMLElement>>('anfitrion');
  private editor: Editor | null = null;
  private ultimo = '';
  // Cambia con cada transacción para que la barra recalcule qué formato está activo.
  private pulso = signal(0);

  readonly grupos: Control[][] = [
    [1, 2, 3].map((nivel) => ({
      icono: `h-${nivel}`,
      etiqueta: `Encabezado ${nivel}`,
      atajo: `Ctrl+Alt+${nivel}`,
      activo: () => this.esActivo('heading', { level: nivel }),
      accion: () => this.editor?.chain().focus().toggleHeading({ level: nivel as 1 | 2 | 3 }).run(),
    })),
    [
      {
        icono: 'bold',
        etiqueta: 'Negrita',
        atajo: 'Ctrl+B',
        activo: () => this.esActivo('bold'),
        accion: () => this.editor?.chain().focus().toggleBold().run(),
      },
      {
        icono: 'italic',
        etiqueta: 'Cursiva',
        atajo: 'Ctrl+I',
        activo: () => this.esActivo('italic'),
        accion: () => this.editor?.chain().focus().toggleItalic().run(),
      },
    ],
    [
      {
        icono: 'list',
        etiqueta: 'Lista con viñetas',
        atajo: 'Ctrl+Shift+8',
        activo: () => this.esActivo('bulletList'),
        accion: () => this.editor && alternarLista(this.editor, 'bulletList'),
      },
      {
        icono: 'list-numbers',
        etiqueta: 'Lista numerada',
        atajo: 'Ctrl+Shift+7',
        activo: () => this.esActivo('orderedList'),
        accion: () => this.editor && alternarLista(this.editor, 'orderedList'),
      },
    ],
  ];

  constructor() {
    afterNextRender(() => this.montar());
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  titulo(control: Control): string {
    return control.atajo ? `${control.etiqueta} (${control.atajo})` : control.etiqueta;
  }

  private esActivo(nombre: string, atributos?: Record<string, unknown>): boolean {
    this.pulso();
    return this.editor?.isActive(nombre, atributos) ?? false;
  }

  private montar(): void {
    try {
      this.editor = new Editor({
        element: this.anfitrion().nativeElement,
        extensions: [...EXTENSIONES_EDITOR, Placeholder.configure({ placeholder: 'Escribe aquí...' })],
        content: markdownADoc(untracked(this.contenido)),
        editorProps: {
          attributes: {
            class: 'prosa',
            spellcheck: 'true',
            lang: 'es',
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': 'Contenido de la nota',
          },
        },
        onTransaction: () => this.pulso.update((n) => n + 1),
        onUpdate: () => this.emitirCambio(),
      });
      // Abrir una nota no la modifica: solo se emite cuando el Markdown resultante cambia.
      this.ultimo = docAMarkdown(this.editor.getJSON());
      if (untracked(this.autofoco)) this.editor.commands.focus('end');
    } catch (e) {
      this.fallo.emit(`No se pudo abrir el editor: ${e}`);
    }
  }

  private emitirCambio(): void {
    if (!this.editor) return;
    let markdown: string;
    try {
      markdown = docAMarkdown(this.editor.getJSON());
    } catch (e) {
      this.fallo.emit(`No se pudo convertir la nota a Markdown: ${e}`);
      return;
    }
    if (markdown === this.ultimo) return;
    this.ultimo = markdown;
    this.cambio.emit(markdown);
  }
}
