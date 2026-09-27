import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NotesService } from '../../core/notes.service';

@Component({
  selector: 'app-note-viewer',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './note-viewer.component.html',
  styleUrl: './note-viewer.component.css',
})
export class NoteViewerComponent {
  notes = inject(NotesService);
}