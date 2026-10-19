import { apiService } from '@common/services/api-service';

/** The sidebar's two kinds of note: a comment is INTERNAL, a tjänsteanteckning PUBLIC. */
export type NoteType = 'PUBLIC' | 'INTERNAL';

export const noteIsComment = (noteType: NoteType): boolean => noteType === 'INTERNAL';

export const noteIsTjansteanteckning = (noteType: NoteType): boolean => noteType === 'PUBLIC';

interface SupportNoteDto {
  context: string;
  role?: string;
  partyId: string;
  subject: string;
  body: string;
  createdBy: string;
}

export interface SupportNote {
  id: string;
  context: string;
  role: string;
  clientId: string;
  partyId: string;
  subject: string;
  body: string;
  caseId: string;
  createdBy: string;
  created: string;
}

export interface SupportNoteData {
  notes: SupportNote[];
  _meta: {
    page: 1;
    limit: 100;
    count: 1;
    totalRecords: 1;
    totalPages: 1;
  };
}

export const getSupportNotes: (errandId: string) => Promise<SupportNoteData> = (errandId) => {
  return apiService
    .get<SupportNoteData>(`supportnotes/${errandId}`)
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching notes', e);
      return { notes: [] } as unknown as SupportNoteData;
    });
};

export const getSupportNotesCount: (errandId: string) => Promise<number> = (errandId) => {
  return apiService
    .get<SupportNoteData>(`supportnotes/${errandId}`)
    .then((res) => {
      return res.data.notes.length;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching notes', e);
      return 0;
    });
};

export const saveSupportNote: (errandId: string, body: string, partyId?: string) => Promise<boolean> = (
  errandId,
  body,
  partyId
) => {
  return apiService
    .post<boolean, Partial<SupportNoteDto>>(`supportnotes/${errandId}`, { body, partyId })
    .then((res) => {
      return true;
    })
    .catch((e) => {
      console.error('Something went wrong when creating note');
      throw e;
    });
};

/** Service notes (tjänsteanteckningar) are listed and written apart from the comments, and never changed once saved. */
const serviceNotesUrl = (errandId: string) => `supportnotes/${encodeURIComponent(errandId)}/service-notes`;

export const getSupportServiceNotes = (errandId: string): Promise<SupportNoteData> =>
  apiService
    .get<SupportNoteData>(serviceNotesUrl(errandId))
    .then((res) => res.data)
    .catch((e) => {
      console.error('Something went wrong when fetching service notes', e);
      return { notes: [] } as unknown as SupportNoteData;
    });

export const getSupportServiceNotesCount = (errandId: string): Promise<number> =>
  getSupportServiceNotes(errandId).then((data) => data.notes?.length ?? 0);

export const saveSupportServiceNote = async (errandId: string, body: string, partyId?: string): Promise<void> => {
  await apiService.post<unknown, Pick<SupportNoteDto, 'body'> & Partial<Pick<SupportNoteDto, 'partyId'>>>(
    serviceNotesUrl(errandId),
    { body, ...(partyId ? { partyId } : {}) }
  );
};

export const updateSupportNote: (errandId: string, noteId: string, body: string) => Promise<boolean> = (
  errandId,
  noteId,
  body
) => {
  return apiService
    .patch<boolean, Partial<SupportNoteDto>>(`supportnotes/${errandId}/notes/${noteId}`, { body })
    .then((res) => {
      return true;
    })
    .catch((e) => {
      console.error('Something went wrong when Updating note');
      throw e;
    });
};

export const deleteSupportNote: (errandId: string, noteId: string) => Promise<boolean> = (errandId, noteId) => {
  return apiService
    .deleteRequest<boolean>(`supportnotes/${errandId}/notes/${noteId}`)
    .then((res) => {
      return true;
    })
    .catch((e) => {
      console.error('Something went wrong when deleting note');
      throw e;
    });
};
