import { Injectable, signal } from '@angular/core';
import { load, Store } from '@tauri-apps/plugin-store';

const CLAVE_RAIZ = 'carpetaRaiz';

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private store: Store | null = null;
    readonly carpetaRaiz = signal<string | null>(null);

    async cargar(): Promise<void> {
        this.store = await load('notara-settings.json', { autoSave: true });
        const ruta = await this.store.get<string>(CLAVE_RAIZ);
        this.carpetaRaiz.set(ruta ?? null);
    }

    async guardarCarpetaRaiz(ruta: string): Promise<void> {
        if (!this.store) return;
        await this.store.set(CLAVE_RAIZ, ruta);
        await this.store.save();
        this.carpetaRaiz.set(ruta);
    }
}