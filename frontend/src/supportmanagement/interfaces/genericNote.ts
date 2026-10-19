export interface GenericNote {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  date: string;
  signed?: boolean;
}

export interface ErrandNotesTabFormModel {
  id?: string;
  partyId?: string;
  text: string;
}
