import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Barra de título propia: la ventana no lleva la decoración nativa. Arrastrar y el doble clic
// para maximizar los resuelve Tauri con el atributo data-tauri-drag-region de la plantilla.
@Component({
  selector: 'app-titlebar',
  standalone: true,
  imports: [],
  templateUrl: './titlebar.component.html',
  styleUrl: './titlebar.component.css',
})
export class TitlebarComponent implements OnInit, OnDestroy {
  maximizada = signal(false);

  // Fuera de Tauri (pruebas, ng serve en el navegador) no hay ventana que controlar.
  private ventana = isTauri() ? getCurrentWindow() : null;
  private dejarDeEscuchar?: () => void;
  private destruida = false;

  async ngOnInit(): Promise<void> {
    const ventana = this.ventana;
    if (!ventana) return;

    const actualizar = async () => this.maximizada.set(await ventana.isMaximized());
    await actualizar();
    // Maximizar no pasa solo por el botón: también el doble clic, Win+↑ o arrastrar al borde.
    const dejar = await ventana.onResized(actualizar);
    if (this.destruida) dejar();
    else this.dejarDeEscuchar = dejar;
  }

  ngOnDestroy(): void {
    this.destruida = true;
    this.dejarDeEscuchar?.();
  }

  minimizar(): void {
    void this.ventana?.minimize();
  }

  alternarMaximizar(): void {
    void this.ventana?.toggleMaximize();
  }

  cerrar(): void {
    void this.ventana?.close();
  }
}
