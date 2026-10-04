import { TestBed } from '@angular/core/testing';
import { MockNotesRepository } from './mock-notes.repository';
import { NOTES_REPOSITORY } from './notes.repository';
import { NotesService } from './notes.service';
import { SettingsService } from './settings.service';
import { TemaService } from './tema.service';

describe('TemaService', () => {
  let settings: SettingsService;
  let notes: NotesService;
  let cambiarSistema: (oscuro: boolean) => void;

  const temaAplicado = () => {
    TestBed.flushEffects();
    return document.documentElement.dataset['tema'];
  };

  function preparar(sistemaOscuro: boolean): void {
    // El tema del sistema no se puede cambiar desde una prueba: se sustituye la consulta.
    const consulta = {
      matches: sistemaOscuro,
      addEventListener: (_: string, alCambiar: (cambio: { matches: boolean }) => void) =>
        (cambiarSistema = (oscuro) => alCambiar({ matches: oscuro })),
    };
    spyOn(window, 'matchMedia').and.returnValue(consulta as unknown as MediaQueryList);
    TestBed.configureTestingModule({
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    });
    settings = TestBed.inject(SettingsService);
    notes = TestBed.inject(NotesService);
    TestBed.inject(TemaService);
  }

  beforeEach(() => localStorage.removeItem('notara-tema'));

  afterEach(() => {
    localStorage.removeItem('notara-tema');
    delete document.documentElement.dataset['tema'];
  });

  it('en automático sigue el tema del sistema, también cuando cambia', () => {
    preparar(true);
    expect(notes.tema()).toBe('auto');
    expect(temaAplicado()).toBe('oscuro');
    cambiarSistema(false);
    expect(temaAplicado()).toBe('claro');
  });

  it('una preferencia explícita manda sobre el sistema', async () => {
    preparar(true);
    await notes.cambiarTema('claro');
    expect(temaAplicado()).toBe('claro');
    await notes.cambiarTema('oscuro');
    cambiarSistema(false);
    expect(temaAplicado()).toBe('oscuro');
  });

  it('la preferencia se guarda en los ajustes', async () => {
    preparar(false);
    const guardar = spyOn(settings, 'guardarTema').and.callThrough();
    await notes.cambiarTema('oscuro');
    expect(guardar).toHaveBeenCalledOnceWith('oscuro');
    expect(notes.tema()).toBe('oscuro');
    expect(notes.error()).toBeNull();
  });

  it('si no se puede guardar, el tema se aplica igual y se avisa', async () => {
    preparar(false);
    spyOn(settings, 'guardarTema').and.callFake(async (tema) => {
      settings.tema.set(tema);
      throw new Error('disco lleno');
    });
    await notes.cambiarTema('oscuro');
    expect(temaAplicado()).toBe('oscuro');
    expect(notes.error()).toContain('disco lleno');
  });
});
