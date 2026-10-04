import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

// Avisa cuando se pulsa fuera del elemento o se presiona Escape, para cerrar menús desplegables.
// Se pone en el contenedor que agrupa el botón que abre el menú y el propio menú.
@Directive({
  selector: '[appCerrarAlSalir]',
  standalone: true,
})
export class CerrarAlSalirDirective {
  private anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appCerrarAlSalir = output<void>();

  @HostListener('document:pointerdown', ['$event'])
  alPulsar(evento: Event): void {
    if (!this.anfitrion.nativeElement.contains(evento.target as Node)) this.appCerrarAlSalir.emit();
  }

  @HostListener('document:keydown.escape')
  alEscapar(): void {
    this.appCerrarAlSalir.emit();
  }
}
