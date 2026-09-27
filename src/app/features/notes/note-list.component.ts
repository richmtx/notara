import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NotesService } from '../../core/notes.service';

@Component({
  selector: 'app-note-list',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './note-list.component.html',
  styleUrl: './note-list.component.css',
})
export class NoteListComponent {
  notes = inject(NotesService);

  preview(contenido: string): string {
    return contenido.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim();
  }
}