import { Component, inject, OnInit } from '@angular/core';
import { NotesService } from './core/notes.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  notes = inject(NotesService);

  async ngOnInit(): Promise<void> {
    await this.notes.inicializar();
  }
}