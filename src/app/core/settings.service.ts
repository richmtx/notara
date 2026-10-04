import { Injectable, signal } from '@angular/core';
import { load, Store } from '@tauri-apps/plugin-store';
import { ORDEN_POR_DEFECTO, OrdenNotas } from '../models/note.model';

const CLAVE_RAIZ = 'carpetaRaiz';
const CLAVE_ORDEN = 'ordenNotas';
const ORDENES: OrdenNotas[] = ['editada', 'titulo', 'creada'];

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private store: Store | null = null;
    readonly carpetaRaiz = signal<string | null>(null);
    readonly ordenNotas = signal<OrdenNotas>(ORDEN_POR_DEFECTO);

    async cargar(): Promise<void> {
        this.store = await load('notara-settings.json', { autoSave: true });
        const ruta = await this.store.get<string>(CLAVE_RAIZ);
        this.carpetaRaiz.set(ruta ?? null);
        const orden = await this.store.get<OrdenNotas>(CLAVE_ORDEN);
        this.ordenNotas.set(orden && ORDENES.includes(orden) ? orden : ORDEN_POR_DEFECTO);
    }

    // El orden se aplica aunque no se pueda guardar: el fallo solo afecta a la próxima sesión.
    async guardarOrdenNotas(orden: OrdenNotas): Promise<void> {
        this.ordenNotas.set(orden);
        if (!this.store) return;
        await this.store.set(CLAVE_ORDEN, orden);
        await this.store.save();
    }

    async guardarCarpetaRaiz(ruta: string): Promise<void> {
        if (!this.store) return;
        await this.store.set(CLAVE_RAIZ, ruta);
        await this.store.save();
        this.carpetaRaiz.set(ruta);
    }
}