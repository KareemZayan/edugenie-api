export interface NoteResponse {
  _id: string;
  content: string;
  createdAt: Date;
}

export interface NotesListResponse {
  notes: NoteResponse[];
}
