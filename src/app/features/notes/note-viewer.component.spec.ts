import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoteViewerComponent } from './note-viewer.component';
import { MockNotesRepository } from '../../core/mock-notes.repository';
import { NOTES_REPOSITORY, NotesRepository } from '../../core/notes.repository';
import { NotesService } from '../../core/notes.service';
import { SettingsService } from '../../core/settings.service';

describe('NoteViewerComponent: HTML del Markdown', () => {
  let fixture: ComponentFixture<NoteViewerComponent>;
  let notes: NotesService;
  let repo: NotesRepository;

  const testigo = window as unknown as { notaraXss?: boolean };
  const prosa = () => (fixture.nativeElement as HTMLElement).querySelector('.prosa') as HTMLElement;

  // Deja la nota 1 con ese contenido y la abre en modo lectura.
  async function mostrar(contenido: string): Promise<void> {
    await repo.guardarNota({ ...(await repo.obtenerNota('1'))!, contenido });
    await notes.seleccionarCategoria('trabajo');
    await notes.seleccionarNota('1');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoteViewerComponent],
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    }).compileComponents();
    const settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    settings.carpetaRaiz.set('C:\notas');

    repo = TestBed.inject(NOTES_REPOSITORY);
    notes = TestBed.inject(NotesService);
    await notes.inicializar();
    fixture = TestBed.createComponent(NoteViewerComponent);
    delete testigo.notaraXss;
  });

  afterEach(() => delete testigo.notaraXss);

  it('un script embebido en el contenido no se ejecuta', async () => {
    // Angular avisa por consola, en desarrollo, de que retiró contenido al sanitizar.
    spyOn(console, 'warn');
    await mostrar(
      [
        'Texto antes',
        '',
        '<script>window.notaraXss = true</script>',
        '',
        '<img src="data:image/png;base64,AAAA" onerror="window.notaraXss = true">',
        '',
        '[enlace](javascript:window.notaraXss=true)',
        '',
        'Texto después',
      ].join('\n')
    );
    // El manejador de error de la imagen, de haber sobrevivido, se dispararía al fallar la carga.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(testigo.notaraXss).toBeUndefined();
    expect(prosa().querySelector('script')).toBeNull();
    expect(prosa().querySelector('[onerror]')).toBeNull();
    // Angular neutraliza la URL anteponiéndole «unsafe:», con lo que el navegador no la ejecuta.
    expect(prosa().querySelector('a')?.getAttribute('href')).toMatch(/^unsafe:/);
    expect(notes.contenidoHtml()).not.toContain('<script');
    expect(notes.contenidoHtml()).not.toContain('onerror');
    // Lo que rodea al script sigue en su sitio.
    expect(prosa().textContent).toContain('Texto antes');
    expect(prosa().textContent).toContain('Texto después');
  });

  it('el formato legítimo se conserva', async () => {
    await mostrar(
      [
        '# Encabezado',
        '',
        'Con **negrita**, *cursiva* y `código`.',
        '',
        '- uno',
        '- dos',
        '',
        '1. primero',
        '',
        '> una cita',
        '',
        '[Notara](https://github.com/richmtx/notara)',
        '',
        '```',
        'bloque de código',
        '```',
      ].join('\n')
    );

    const texto = (selector: string) => prosa().querySelector(selector)?.textContent?.trim();
    expect(texto('h1')).toBe('Encabezado');
    expect(texto('strong')).toBe('negrita');
    expect(texto('em')).toBe('cursiva');
    expect(texto('p code')).toBe('código');
    expect(prosa().querySelectorAll('ul li').length).toBe(2);
    expect(texto('ol li')).toBe('primero');
    expect(texto('blockquote')).toBe('una cita');
    expect(prosa().querySelector('a')?.getAttribute('href')).toBe('https://github.com/richmtx/notara');
    expect(texto('pre code')).toBe('bloque de código');
  });
});
