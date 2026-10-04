import { clasificarRuta } from './tauri-notes.repository';

describe('clasificarRuta: qué vigila el watcher', () => {
  const raiz = 'C:\\Notas';

  it('reconoce las notas sueltas y las de una categoría', () => {
    expect(clasificarRuta('C:\\Notas\\suelta.md', raiz)).toBe('nota');
    expect(clasificarRuta('C:\\Notas\\Trabajo\\pendientes.TXT', raiz)).toBe('nota');
    // Windows no distingue mayúsculas en las rutas.
    expect(clasificarRuta('c:\\notas\\Trabajo\\pendientes.md', raiz)).toBe('nota');
  });

  it('una entrada del primer nivel puede ser la carpeta de una categoría', () => {
    expect(clasificarRuta('C:\\Notas\\Trabajo', raiz)).toBe('carpeta');
  });

  it('ignora la papelera, para no refrescar por movimientos internos', () => {
    expect(clasificarRuta('C:\\Notas\\.papelera', raiz)).toBeNull();
    expect(clasificarRuta('C:\\Notas\\.papelera\\suelta.md', raiz)).toBeNull();
    expect(clasificarRuta('C:\\Notas\\.papelera\\Trabajo\\pendientes.md', raiz)).toBeNull();
  });

  it('ignora los temporales de los guardados de la propia app', () => {
    expect(clasificarRuta('C:\\Notas\\suelta.md.tmp', raiz)).toBeNull();
    expect(clasificarRuta('C:\\Notas\\Trabajo\\pendientes.md.tmp', raiz)).toBeNull();
  });

  it('ignora lo que Notara no gestiona', () => {
    expect(clasificarRuta('C:\\Notas\\Trabajo\\foto.png', raiz)).toBeNull();
    expect(clasificarRuta('C:\\Notas\\Trabajo\\adjuntos\\nota.md', raiz)).toBeNull();
    expect(clasificarRuta('C:\\Notas', raiz)).toBeNull();
    expect(clasificarRuta('C:\\NotasViejas\\suelta.md', raiz)).toBeNull();
  });
});
