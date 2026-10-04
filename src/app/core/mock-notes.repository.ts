import { Injectable } from '@angular/core';
import { NotesRepository } from './notes.repository';
import { Note } from '../models/note.model';
import { Category } from '../models/category.model';

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
        rutaArchivo: '',
    },
];

@Injectable()
export class MockNotesRepository implements NotesRepository {
    private notas = [...NOTAS];

    async listarCategorias(): Promise<Category[]> {
        return CATEGORIAS;
    }

    async listarNotas(categoriaId: string): Promise<Note[]> {
        return this.notas
            .filter((n) => n.categoriaId === categoriaId)
            .sort((a, b) => b.editadaEn.getTime() - a.editadaEn.getTime());
    }

    async obtenerNota(id: string): Promise<Note | null> {
        return this.notas.find((n) => n.id === id) ?? null;
    }

    async guardarNota(nota: Note): Promise<Note> {
        const guardada = { ...nota, editadaEn: new Date() };
        const i = this.notas.findIndex((n) => n.id === nota.id);
        if (i >= 0) this.notas[i] = guardada;
        else this.notas.push(guardada);
        return guardada;
    }

    async eliminarNota(id: string): Promise<void> {
        this.notas = this.notas.filter((n) => n.id !== id);
    }

    async descartarNota(id: string): Promise<void> {
        await this.eliminarNota(id);
    }
}