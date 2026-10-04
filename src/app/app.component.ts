import { Component, inject, OnInit } from '@angular/core';
import { NotesService } from './core/notes.service';
import { TitlebarComponent } from './shared/titlebar.component';
import { SidebarComponent } from './features/categories/sidebar.component';
import { NoteListComponent } from './features/notes/note-list.component';
import { NoteViewerComponent } from './features/notes/note-viewer.component';
import { WelcomeComponent } from './features/welcome/welcome.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    TitlebarComponent,
    SidebarComponent,
    NoteListComponent,
    NoteViewerComponent,
    WelcomeComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  notes = inject(NotesService);

  async ngOnInit(): Promise<void> {
    await this.notes.inicializar();
  }
}