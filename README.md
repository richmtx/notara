# Notara

App de escritorio para tomar y organizar notas. Cada nota es un archivo Markdown en una carpeta de tu disco.

## El problema

Las notas rápidas acaban como archivos de texto sueltos en el escritorio: `nota.txt`, `pendientes (2).txt`, `ideas final.txt`. Sin orden, sin búsqueda y sin forma de saber qué hay en cada uno sin abrirlo.

Notara pone una interfaz encima de esos archivos —categorías, búsqueda, favoritos, etiquetas— sin sacarlos de donde están.

<!-- Captura de pantalla o GIF: reemplaza la ruta cuando exista la imagen -->
![Captura de Notara](docs/captura.png)

## Funcionalidades

- **Tres paneles**: categorías, lista de notas y nota abierta.
- **Categorías**: cada una es una subcarpeta. Los archivos sueltos de la raíz aparecen en «Sin categoría».
- **Editor enriquecido** con barra de formato, que guarda Markdown. Si una nota tiene Markdown que el editor no conservaría intacto, se edita como texto plano en lugar de alterarla.
- **Autoguardado** mientras escribes.
- **Búsqueda** por título y contenido dentro de la categoría abierta.
- **Favoritos** y **etiquetas**.
- **Orden** por última edición, título o fecha de creación.
- **Mover** notas entre categorías y **mostrar el archivo** en el Explorador.
- **Papelera**: lo eliminado se puede restaurar a su categoría original o borrar definitivamente.
- Lee y edita también archivos `.txt`.

## Los archivos son la fuente de verdad

Notara no tiene base de datos. Eliges una carpeta y la app trabaja directamente sobre ella:

```
Mis notas/
├── Trabajo/
│   └── Reunión de lunes.md
├── Recetas/
│   └── Pan de masa madre.md
├── Idea suelta.md
└── .papelera/
    └── Trabajo/
        └── Borrador viejo.md
```

- Una categoría es una carpeta; una nota es un archivo `.md`.
- Los metadatos van en el propio archivo, como frontmatter:

  ```markdown
  ---
  titulo: Reunión de lunes
  tags: [trabajo, pendientes]
  favorito: true
  ---

  Contenido de la nota…
  ```

  Las líneas de frontmatter que Notara no conoce se conservan al guardar.
- La papelera es la carpeta `.papelera`, que replica las carpetas de origen. No hay índice aparte.

En consecuencia, las notas se pueden abrir con cualquier editor, respaldar copiando la carpeta, sincronizar con el servicio que prefieras o versionar con Git. Si dejas de usar Notara, no hay nada que exportar.

Lo único que la app guarda por su cuenta son dos preferencias: la carpeta elegida y el orden de la lista.

## Stack

- [Angular 19](https://angular.dev) (componentes standalone y signals) para la interfaz
- [Tauri 2](https://tauri.app) (Rust) como contenedor de escritorio y acceso al sistema de archivos
- [TipTap 3](https://tiptap.dev) para el editor, [marked](https://marked.js.org) para la vista de lectura
- Jasmine y Karma para las pruebas

## Instalación

Solo Windows x64 por ahora.

1. Descarga `Notara_<versión>_x64_es-ES.msi` desde [Releases](https://github.com/richmtx/notara/releases).
2. Ejecútalo y sigue el asistente. El instalador no está firmado, así que Windows SmartScreen puede mostrar una advertencia: «Más información» → «Ejecutar de todas formas».
3. Abre Notara y elige la carpeta donde están (o estarán) tus notas.

Requiere WebView2, que ya viene con Windows 10 y 11 actualizados; si falta, el instalador lo descarga.

## Compilar desde el código fuente

Requisitos:

- [Node.js](https://nodejs.org) 20 o superior
- [Rust](https://rustup.rs) 1.90 o superior
- [Requisitos de Tauri para Windows](https://tauri.app/start/prerequisites/): Microsoft C++ Build Tools y WebView2

```bash
git clone https://github.com/richmtx/notara.git
cd notara
npm install

npm run desktop        # app en modo desarrollo
npm test               # pruebas unitarias
npm run tauri build    # genera el instalador
```

El instalador queda en `src-tauri/target/release/bundle/msi/`.

Para publicar una versión, sube un tag `v*` (por ejemplo `v1.0.0`): el workflow de GitHub Actions compila el `.msi` y lo adjunta al release.

## Licencia

[MIT](LICENSE) © 2026 Ricardo Martínez Hernández
