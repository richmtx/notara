import { Injectable } from '@angular/core';
import { CambioExterno, ContenidoCategoria, EliminacionCategoria, NotesRepository, Restauracion } from './notes.repository';
import { Note } from '../models/note.model';
import { Category, SIN_CATEGORIA } from '../models/category.model';

const CATEGORIAS: Category[] = [
    { id: 'trabajo', nombre: 'Trabajo', icono: 'briefcase', carpeta: 'Trabajo', total: 2 },
    { id: 'aws', nombre: 'AWS', icono: 'cloud', carpeta: 'AWS', total: 1 },
    { id: 'proyectos', nombre: 'Proyectos', icono: 'code', carpeta: 'Proyectos', total: 1 },
    { id: 'personal', nombre: 'Personal', icono: 'user', carpeta: 'Personal', total: 0 },
];

const NOTAS: Note[] = [
    {
        id: '1',
        titulo: 'Perfil GitHub',
        contenido:
            'Mejorar el README del perfil para que muestre quién soy y en qué trabajo.\n\nAgregar proyectos destacados con enlaces y las tecnologías que manejo.',
        categoriaId: 'trabajo',
        tags: ['github', 'portafolio'],
        favorito: false,
        editadaEn: new Date('2026-09-25T14:30:00'),
        creadaEn: new Date('2026-09-10T09:00:00'),
        rutaArchivo: '',
    },
    {
        id: '2',
        titulo: 'Cambios TV Tecno',
        contenido: 'Pendientes del panel admin: ajustes en la galería y la sección de eventos.',
        categoriaId: 'trabajo',
        tags: ['tvtecno'],
        favorito: false,
        editadaEn: new Date('2026-09-24T10:00:00'),
        creadaEn: new Date('2026-09-18T16:20:00'),
        rutaArchivo: '',
    },
    {
        id: '3',
        titulo: 'Certificaciones AWS',
        contenido: 'Ruta de estudio: Cloud Practitioner primero, después Solutions Architect Associate.',
        categoriaId: 'aws',
        tags: ['aws', 'certificacion'],
        favorito: true,
        editadaEn: new Date('2026-09-22T09:15:00'),
        creadaEn: new Date('2026-09-21T11:45:00'),
        rutaArchivo: '',
    },
    {
        id: '4',
        titulo: 'Login',
        contenido: 'Ideas para el diseño del login: campos, validaciones y estilo visual.',
        categoriaId: 'proyectos',
        tags: ['ui'],
        favorito: false,
        editadaEn: new Date('2026-09-20T18:40:00'),
        creadaEn: new Date('2026-09-05T08:30:00'),
        rutaArchivo: '',
    },
];

@Injectable()
export class MockNotesRepository implements NotesRepository {
    private notas = [...NOTAS];
    private categorias = [...CATEGORIAS];
    private papelera: Note[] = [];
    private ultimoGuardado = 0;
    private alDetectar: (() => void) | null = null;
    private cambioPendiente: CambioExterno = { notas: [], carpetas: false };

    async listarCategorias(): Promise<Category[]> {
        return this.categorias.map((c) => ({
            ...c,
            total: this.notas.filter((n) => n.categoriaId === c.id).length,
        }));
    }

    async crearCategoria(nombre: string): Promise<Category> {
        if (this.categorias.some((c) => c.carpeta.toLowerCase() === nombre.toLowerCase())) {
            throw new Error(`Ya existe una carpeta llamada «${nombre}»`);
        }
        const creada: Category = { id: nombre, nombre, icono: 'folder', carpeta: nombre, total: 0 };
        this.categorias.push(creada);
        return creada;
    }

    async contenidoCategoria(id: string): Promise<ContenidoCategoria> {
        return { notas: this.notas.filter((n) => n.categoriaId === id).length, ajenos: [] };
    }

    async eliminarCategoria(id: string): Promise<EliminacionCategoria> {
        const notas = this.notas.filter((n) => n.categoriaId === id);
        let movidas = 0;
        try {
            for (const nota of notas) {
                await this.eliminarNota(nota.id);
                movidas++;
            }
        } catch (e) {
            return { eliminada: false, movidas, pendientes: notas.length - movidas, ajenos: [], motivo: `${e}` };
        }
        this.categorias = this.categorias.filter((c) => c.id !== id);
        return { eliminada: true, movidas, pendientes: 0, ajenos: [] };
    }

    async listarNotas(categoriaId: string): Promise<Note[]> {
        return this.notas
            .filter((n) => n.categoriaId === categoriaId)
            .sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
    }

    async listarTodas(): Promise<Note[]> {
        return [...this.notas].sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
    }

    async listarFavoritas(): Promise<Note[]> {
        return (await this.listarTodas()).filter((n) => n.favorito);
    }

    async obtenerNota(id: string): Promise<Note | null> {
        return this.notas.find((n) => n.id === id) ?? null;
    }

    async guardarNota(nota: Note): Promise<Note> {
        // Como el repositorio real: no se escribe encima de un cambio externo sin revisar.
        if (this.cambioPendiente.notas.some((n) => n.id === nota.id)) {
            throw new Error('el archivo cambió fuera de Notara y no se sobrescribió');
        }
        // Dos guardados seguidos pueden caer en el mismo milisegundo: el segundo tiene que
        // quedar igualmente como el más reciente, o el orden por fecha de edición empata.
        this.ultimoGuardado = Math.max(Date.now(), this.ultimoGuardado + 1);
        const guardada = { ...nota, editadaEn: new Date(this.ultimoGuardado) };
        const i = this.notas.findIndex((n) => n.id === nota.id);
        if (i >= 0) this.notas[i] = guardada;
        else this.notas.push(guardada);
        return guardada;
    }

    async eliminarNota(id: string): Promise<void> {
        const nota = this.notas.find((n) => n.id === id);
        if (!nota) return;
        this.notas = this.notas.filter((n) => n !== nota);
        this.papelera.push(nota);
    }

    async descartarNota(id: string): Promise<void> {
        this.notas = this.notas.filter((n) => n.id !== id);
        this.papelera = this.papelera.filter((n) => n.id !== id);
    }

    async listarPapelera(): Promise<Note[]> {
        return [...this.papelera].sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
    }

    async restaurarNota(id: string): Promise<Restauracion> {
        const nota = this.papelera.find((n) => n.id === id);
        if (!nota) throw new Error('La nota ya no está en la papelera');

        const { categoriaId } = nota;
        const categoriaRecreada =
            categoriaId !== SIN_CATEGORIA && !this.categorias.some((c) => c.id === categoriaId);
        if (categoriaRecreada) await this.crearCategoria(categoriaId);
        this.papelera = this.papelera.filter((n) => n !== nota);
        this.notas.push(nota);
        return { categoriaId, categoriaRecreada };
    }

    async vaciarPapelera(): Promise<void> {
        this.papelera = [];
    }

    async moverNota(id: string, categoriaId: string): Promise<Note> {
        const i = this.notas.findIndex((n) => n.id === id);
        if (i < 0) throw new Error('La nota ya no existe');
        this.notas[i] = { ...this.notas[i], categoriaId };
        return this.notas[i];
    }

    async mostrarEnExplorador(): Promise<void> {
        // Las notas de prueba no tienen archivo que mostrar.
    }

    async vigilar(alDetectar: () => void): Promise<() => void> {
        this.alDetectar = alDetectar;
        return () => {
            if (this.alDetectar === alDetectar) this.alDetectar = null;
        };
    }

    async cambiosExternos(): Promise<CambioExterno> {
        const cambio = this.cambioPendiente;
        this.cambioPendiente = { notas: [], carpetas: false };
        return cambio;
    }

    // Lo que sigue hace de «otro programa» tocando la carpeta de notas, para las pruebas.

    // Aviso del watcher sin más: el real también salta con los guardados de la propia app.
    detectar(): void {
        this.alDetectar?.();
    }

    // `avisar: false` = el cambio ya está en disco pero el watcher todavía no lo ha notificado.
    guardarPorFuera(nota: Note, avisar = true): void {
        const i = this.notas.findIndex((n) => n.id === nota.id);
        if (i >= 0) this.notas[i] = nota;
        else this.notas.push(nota);
        this.cambiarPorFuera(nota, avisar);
    }

    eliminarPorFuera(id: string, avisar = true): void {
        const nota = this.notas.find((n) => n.id === id);
        if (!nota) return;
        this.notas = this.notas.filter((n) => n !== nota);
        this.cambiarPorFuera(nota, avisar);
    }

    private cambiarPorFuera({ id, categoriaId }: Note, avisar: boolean): void {
        this.cambioPendiente.notas.push({ id, categoriaId });
        if (avisar) this.detectar();
    }
}