import { sanitizedInline } from '@common/services/sanitizer-service';
import { getInitialsFromADUsername, getNameFromADUsername } from '@common/services/user-service';
import { getToastOptions } from '@common/utils/toast-message-settings';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Avatar,
  Button,
  cx,
  Divider,
  FormControl,
  Input,
  Modal,
  PopupMenu,
  Textarea,
  useConfirm,
  useSnackbar,
} from '@sk-web-gui/react';
import { useSupportStore, useUserStore } from '@stores/index';
import { ErrandNotesTabFormModel, GenericNote } from '@supportmanagement/interfaces/genericNote';
import {
  ExternalIdType,
  getSupportErrandById,
  isSupportErrandLocked,
  validateAction,
} from '@supportmanagement/services/support-errand-service';
import {
  deleteSupportNote,
  getSupportNotes,
  getSupportServiceNotes,
  noteIsComment,
  noteIsTjansteanteckning,
  NoteType,
  saveSupportNote,
  saveSupportServiceNote,
  SupportNote,
  updateSupportNote,
} from '@supportmanagement/services/support-note-service';
import dayjs from 'dayjs';
import { Ellipsis, Pencil, Trash } from 'lucide-react';
import { FC, Fragment, useEffect, useState } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import * as yup from 'yup';

let formSchema = yup
  .object({
    id: yup.string().optional(),
    partyId: yup.string().optional(),
    text: yup.string().required('Text måste anges'),
  })
  .required();

export const SidebarGenericNotes: FC<{
  label_plural: 'Kommentarer' | 'Tjänsteanteckningar';
  label_singular: 'Kommentar' | 'Tjänsteanteckning';
  noteType: NoteType;
}> = ({ label_plural, label_singular, noteType }) => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const administrators = useUserStore((s) => s.administrators);
  const [selectedNote, setSelectedNote] = useState<GenericNote>();
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [editNote, setEditNote] = useState(false);
  /** The text of the note being edited, as it was saved. */
  const [editedNoteBody, setEditedNoteBody] = useState<string>();
  const confirm = useConfirm();
  const toastMessage = useSnackbar();
  const pageSize = 8;
  const user = useUserStore((s) => s.user);
  const serviceNote = noteIsTjansteanteckning(noteType);
  // A service note is the handler's record of the errand: written by the assigned handler while the errand
  // accepts writes, and never changed or removed once saved. The BFF enforces the same rules.
  const allowed = !!supportErrand && validateAction(supportErrand, user) && !isSupportErrandLocked(supportErrand);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  }: UseFormReturn<ErrandNotesTabFormModel, any, undefined> = useForm({
    resolver: yupResolver(formSchema) as any,
  });

  const onSubmit = (note: ErrandNotesTabFormModel) => {
    setIsLoading(true);

    let createNote = true;

    const apiCall = serviceNote
      ? saveSupportServiceNote(supportErrand!.id!, note.text, note.partyId)
      : note.id
      ? updateSupportNote(supportErrand!.id!, note.id, note.text)
      : saveSupportNote(supportErrand!.id!, note.text, note.partyId);

    return apiCall
      .then(() => {
        toastMessage(
          getToastOptions({
            message: `${label_singular}en sparades`,
            status: 'success',
          })
        );
        setIsLoading(false);
        getSupportErrandById(supportErrand!.id!).then((res) => setSupportErrand(res.errand));
        setValue('text', '');
      })
      .catch((e) => {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message: `Något gick fel när ${label_singular.toLocaleLowerCase()}en sparades`,
          status: 'error',
        });
        setIsLoading(false);
        createNote = false;
        // TODO UI-phase rule for internal notes?
      });
  };

  const onError = () => {
    console.error('Something went wrong when saving note');
  };

  useEffect(() => {
    // Both readers answer an empty list on failure; they never reject.
    void (serviceNote ? getSupportServiceNotes : getSupportNotes)(supportErrand!.id!).then((res) =>
      setNotes(res.notes)
    );
    if (selectedNote) {
      setSelectedNote(notes.map(makeGeneric).find((n) => n.id === selectedNote.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportErrand]);

  const text = watch().text;

  const updateNote = (inNote: GenericNote) => {
    setValue('text', inNote.body);
    setValue('id', inNote.id);
    setEditedNoteBody(inNote.body);
    setEditNote(true);
  };

  /** The note's text is as it was saved, so there is nothing to write. */
  const editedNoteUnchanged = text === editedNoteBody;

  const saveModifiedNote = () => {
    const note: ErrandNotesTabFormModel = getValues();
    // Only what changed is written: saving the text it already has is still an update of the note.
    if (note.text === editedNoteBody) {
      setEditNote(false);
      return Promise.resolve();
    }
    return updateSupportNote(supportErrand!.id!, note.id!, note.text)
      .then(() => {
        toastMessage(
          getToastOptions({
            message: `${label_singular}en sparades`,
            status: 'success',
          })
        );
        getSupportErrandById(supportErrand!.id!).then((res) => setSupportErrand(res.errand));
        setValue('text', '');
        setValue('id', '');
        setEditNote(false);
      })
      .catch((e) => {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message: `Något gick fel när ${label_singular.toLocaleLowerCase()}en sparades`,
          status: 'error',
        });
        setIsLoading(false);
        return;
      });
  };

  const removeNote = (inNote: GenericNote) => {
    return deleteSupportNote(supportErrand!.id!, inNote.id)
      .then(() => {
        toastMessage(
          getToastOptions({
            message: `${label_singular}en togs bort`,
            status: 'success',
          })
        );
        getSupportErrandById(supportErrand!.id!).then((res) => setSupportErrand(res.errand));
        setValue('text', '');
      })
      .catch((e) => {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message: `Något gick fel när ${label_singular.toLocaleLowerCase()}en togs bort`,
          status: 'error',
        });
        return;
      });
  };

  const makeGeneric: (note: SupportNote) => GenericNote = (note) => {
    return {
      id: note.id,
      title: note.subject,
      body: note.body,
      createdBy: note.createdBy,
      date: note.created,
      signed: false,
    };
  };

  useEffect(() => {
    const primaryStakeholder = supportErrand?.customer?.find((x) => x.role === 'PRIMARY');
    if (primaryStakeholder?.externalIdType === ExternalIdType.PRIVATE && primaryStakeholder?.externalId) {
      setValue('partyId', primaryStakeholder?.externalId);
    } else {
      setValue('partyId', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportErrand]);

  return (
    <div className="relative h-full flex flex-col justify-start">
      <div className="px-0 flex justify-between items-center">
        <span className="text-base md:text-large xl:text-lead font-semibold">{label_plural}</span>
      </div>
      {notes && notes.length > 0 ? (
        <div className="mt-md flex flex-col" data-cy="noteslist">
          {notes
            .slice((activePage - 1) * pageSize, activePage * pageSize)
            .map(makeGeneric)
            .map((note, index) => {
              return (
                <Fragment key={`note-${index}`}>
                  <div
                    onClick={() => setSelectedNote(note)}
                    className={cx('py-4 px-12', `relative w-full flex justify-between`)}
                  >
                    <div className="flex gap-md">
                      <div className="w-32">
                        <Avatar
                          rounded
                          color="juniskar"
                          size={'sm'}
                          title={getNameFromADUsername(note.createdBy, administrators) ?? note.createdBy}
                          initials={getInitialsFromADUsername(note.createdBy, administrators) || note.createdBy[0]}
                        />
                      </div>

                      <div>
                        <p className="my-0">
                          <strong
                            className="mr-md"
                            dangerouslySetInnerHTML={{
                              __html: sanitizedInline(note.body || ''),
                            }}
                          />
                        </p>

                        <p className="my-0 flex justify-between">
                          {/* Who wrote it, named as the handler list names them, else by their account. */}
                          <span className="text-xs" data-cy="note-author-and-date">
                            {getNameFromADUsername(note.createdBy, administrators) ?? note.createdBy} ·{' '}
                            {dayjs(note.date).format('D MMM, HH:mm')}
                          </span>
                        </p>
                      </div>
                    </div>
                    {!serviceNote && (
                      <div className="relative">
                        <PopupMenu position="left">
                          <PopupMenu.Button
                            size="sm"
                            aria-label="Allternativ"
                            data-cy={`options-${note.id}`}
                            iconButton
                            className="bg-transparent"
                            variant="ghost"
                          >
                            <Ellipsis />
                          </PopupMenu.Button>
                          <PopupMenu.Panel>
                            <PopupMenu.Items>
                              <PopupMenu.Group>
                                <PopupMenu.Item>
                                  <Button
                                    data-cy="edit-note-button"
                                    disabled={noteIsComment(noteType) && supportErrand?.status === 'SOLVED'}
                                    leftIcon={<Pencil />}
                                    onClick={() => {
                                      updateNote(note);
                                    }}
                                  >
                                    Ändra
                                  </Button>
                                </PopupMenu.Item>
                              </PopupMenu.Group>
                              <PopupMenu.Group>
                                <PopupMenu.Item>
                                  <Button
                                    data-cy="delete-note-button"
                                    leftIcon={<Trash />}
                                    onClick={() => {
                                      confirm
                                        .showConfirmation(
                                          'Ta bort kommentar',
                                          'Vill du ta bort kommentaren?',
                                          'Ja',
                                          'Nej',
                                          'info',
                                          'info'
                                        )
                                        .then((confirmed) => {
                                          if (confirmed) {
                                            removeNote(note);
                                          }
                                        });
                                    }}
                                  >
                                    Ta bort
                                  </Button>
                                </PopupMenu.Item>
                              </PopupMenu.Group>
                            </PopupMenu.Items>
                          </PopupMenu.Panel>
                        </PopupMenu>
                      </div>
                    )}
                  </div>
                  <Divider />
                </Fragment>
              );
            })}
        </div>
      ) : (
        <div className="my-md">Det finns inga {label_plural.toLocaleLowerCase()}</div>
      )}
      {!editNote && (
        <div className="w-full mt-xl flex flex-col items-start gap-12">
          <Input type="hidden" {...register('id')} />
          <Input type="hidden" {...register('partyId')} />
          <FormControl id="note" className="w-full">
            <Textarea
              className="w-full"
              rows={5}
              placeholder={`Ny ${label_singular.toLocaleLowerCase()}`}
              aria-label={`Ny ${label_singular.toLocaleLowerCase()}`}
              value={text}
              disabled={serviceNote && !allowed}
              {...register('text')}
            ></Textarea>
          </FormControl>
          {serviceNote && (
            <small className="my-0 text-dark-secondary" data-cy="service-note-rule">
              {allowed
                ? 'En sparad tjänsteanteckning kan inte ändras eller tas bort.'
                : 'Endast ärendets handläggare kan skriva tjänsteanteckningar.'}
            </small>
          )}
          <Button
            color="primary"
            disabled={
              !supportErrand?.id ||
              text === '' ||
              (noteIsTjansteanteckning(noteType) && !allowed) ||
              (noteIsComment(noteType) && supportErrand.status === 'SOLVED')
            }
            loadingText="Sparar"
            loading={isLoading}
            data-cy="save-newcomment"
            size="sm"
            onClick={handleSubmit(onSubmit as any, onError)}
          >
            Spara
          </Button>
        </div>
      )}

      <Modal show={editNote} className="w-[43rem]" onClose={() => setEditNote(false)} label={'Ändra kommentar'}>
        <Modal.Content>
          <Textarea rows={4} data-cy="edit-notes-input" className="w-full" {...register('text')}></Textarea>
        </Modal.Content>
        <Modal.Footer>
          <Button
            data-cy="save-updatedcomment"
            className="w-full"
            variant="primary"
            disabled={editedNoteUnchanged}
            onClick={() => saveModifiedNote()}
          >
            Spara
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
