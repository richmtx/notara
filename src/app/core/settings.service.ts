import { Injectable, signal } from '@angular/core';
import { load, Store } from '@tauri-apps/plugin-store';
import { ORDEN_POR_DEFECTO, OrdenNotas } from '../models/note.model';

// 'auto' sigue el tema del sistema.
export type Tema = 'claro' | 'oscuro' | 'auto';

const CLAVE_RAIZ = 'carpetaRaiz';
const CLAVE_ORDEN = 'ordenNotas';
const CLAVE_TEMA = 'tema';
const ORDENES: OrdenNotas[] = ['editada', 'titulo', 'creada'];
const TEMAS: Tema[] = ['claro', 'oscuro', 'auto'];
const TEMA_POR_DEFECTO: Tema = 'auto';
// Copia del tema en localStorage. Los ajustes se leen de forma asíncrona, cuando la ventana ya
// se pintó; con la copia, index.html aplica el tema antes del primer pintado.
const COPIA_TEMA = 'notara-tema';

const temaValido = (valor: unknown): Tema =>
    TEMAS.includes(valor as Tema) ? (valor as Tema) : TEMA_POR_DEFECTO;

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private store: Store | null = null;
    readonly carpetaRaiz = signal<string | null>(null);
    readonly ordenNotas = signal<OrdenNotas>(ORDEN_POR_DEFECTO);
    readonly tema = signal<Tema>(this.leerCopiaTema());

    async cargar(): Promise<void> {
        this.store = await load('notara-settings.json', { autoSave: true });
        const ruta = await this.store.get<string>(CLAVE_RAIZ);
        this.carpetaRaiz.set(ruta ?? null);
        const orden = await this.store.get<OrdenNotas>(CLAVE_ORDEN);
        this.ordenNotas.set(orden && ORDENES.includes(orden) ? orden : ORDEN_POR_DEFECTO);
        this.aplicarTema(temaValido(await this.store.get<Tema>(CLAVE_TEMA)));
    }

    // El orden se aplica aunque no se pueda guardar: el fallo solo afecta a la próxima sesión.
    async guardarOrdenNotas(orden: OrdenNotas): Promise<void> {
        this.ordenNotas.set(orden);
        if (!this.store) return;
        await this.store.set(CLAVE_ORDEN, orden);
        await this.store.save();
    }

    // Igual que el orden: se aplica aunque no se pueda guardar.
    async guardarTema(tema: Tema): Promise<void> {
        this.aplicarTema(tema);
        if (!this.store) return;
        await this.store.set(CLAVE_TEMA, tema);
        await this.store.save();
    }

    async guardarCarpetaRaiz(ruta: string): Promise<void> {
        if (!this.store) return;
        await this.store.set(CLAVE_RAIZ, ruta);
        await this.store.save();
        this.carpetaRaiz.set(ruta);
    }

    private aplicarTema(tema: Tema): void {
        this.tema.set(tema);
        try {
            localStorage.setItem(COPIA_TEMA, tema);
        } catch {
            // Sin la copia el tema se aplica igual, solo que un instante después de arrancar.
        }
    }

    private leerCopiaTema(): Tema {
        try {
            return temaValido(localStorage.getItem(COPIA_TEMA));
        } catch {
            return TEMA_POR_DEFECTO;
        }
    }
}
