import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { MockNotesRepository } from './core/mock-notes.repository';
import { NOTES_REPOSITORY } from './core/notes.repository';
import { NotesService } from './core/notes.service';
import { SettingsService } from './core/settings.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let settings: SettingsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: NOTES_REPOSITORY, useClass: MockNotesRepository }],
    }).compileComponents();

    // Los ajustes se leen con un plugin de Tauri, que no existe en el navegador de pruebas.
    settings = TestBed.inject(SettingsService);
    spyOn(settings, 'cargar').and.resolveTo();
    fixture = TestBed.createComponent(AppComponent);
  });

  const elemento = () => fixture.nativeElement as HTMLElement;

  async function arrancar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('se crea correctamente', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('inicializa el NotesService al arrancar', async () => {
    const inicializar = spyOn(TestBed.inject(NotesService), 'inicializar').and.callThrough();
    await arrancar();
    expect(inicializar).toHaveBeenCalledTimes(1);
    expect(settings.cargar).toHaveBeenCalled();
  });

  it('muestra la bienvenida cuando no hay carpeta raíz configurada', async () => {
    await arrancar();
    expect(elemento().querySelector('app-welcome')).not.toBeNull();
    expect(elemento().querySelector('.layout')).toBeNull();
  });

  it('muestra las notas cuando hay carpeta raíz configurada', async () => {
    settings.carpetaRaiz.set('C:\\notas');
    await arrancar();
    expect(elemento().querySelector('app-welcome')).toBeNull();
    expect(elemento().querySelector('app-sidebar')).not.toBeNull();
    expect(TestBed.inject(NotesService).categorias().length).toBeGreaterThan(0);
  });
});
