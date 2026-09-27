import { Component, inject } from '@angular/core';
import { NotesService } from '../../core/notes.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
})
export class WelcomeComponent {
  notes = inject(NotesService);
}