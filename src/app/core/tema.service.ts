import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';

// Traduce la preferencia de tema (claro, oscuro o el del sistema) al atributo data-tema de la
// página, del que cuelgan los tokens de color de styles.css.
@Injectable({ providedIn: 'root' })
export class TemaService {
    private settings = inject(SettingsService);
    private consulta = window.matchMedia('(prefers-color-scheme: dark)');
    private sistemaOscuro = signal(this.consulta.matches);

    readonly oscuro = computed(() => {
        const tema = this.settings.tema();
        return tema === 'auto' ? this.sistemaOscuro() : tema === 'oscuro';
    });

    constructor() {
        // En automático la app cambia a la vez que el sistema, sin reiniciarla.
        this.consulta.addEventListener('change', (cambio) => this.sistemaOscuro.set(cambio.matches));
        effect(() => {
            document.documentElement.dataset['tema'] = this.oscuro() ? 'oscuro' : 'claro';
        });
    }
}
