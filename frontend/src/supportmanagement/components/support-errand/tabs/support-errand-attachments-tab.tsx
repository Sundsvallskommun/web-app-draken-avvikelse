import FileUpload, { imageMimeTypes } from '@common/components/file-upload/file-upload.component';
import { FileUploadWrapper } from '@common/components/file-upload/file-upload-dragdrop-context';
import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { getAttachmentChannelLabel, isKnownAttachmentChannel } from '@common/interfaces/attachment-channel';
import { getToastOptions } from '@common/utils/toast-message-settings';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Button,
  Divider,
  FormControl,
  FormErrorMessage,
  Image,
  Input,
  Modal,
  PopupMenu,
  Spinner,
  useConfirm,
  useSnackbar,
} from '@sk-web-gui/react';
import { useConfigStore, useSupportStore } from '@stores/index';
import { getInvestigationChannelLabel } from '@supportmanagement/investigation/investigation-variant-registry';
import {
  ACCEPTED_UPLOAD_FILETYPES,
  deleteSupportAttachment,
  documentMimeTypes,
  getSupportAttachment,
  saveSupportAttachments,
  SingleSupportAttachment,
  SupportAttachment,
} from '@supportmanagement/services/support-attachment-service';
import {
  getSupportErrandById,
  isSupportErrandLocked,
  supportErrandIsEmpty,
} from '@supportmanagement/services/support-errand-service';
import dayjs from 'dayjs';
import { Ellipsis, Eye, Trash, Upload } from 'lucide-react';
import { FC, Fragment, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import * as yup from 'yup';

interface SingleAttachment {
  file: File | undefined;
}
interface SupportAttachmentFormModel {
  id?: string;
  newAttachment: FileList | undefined;
  attachments: SingleAttachment[];
  attachmentList: SingleAttachment[];
}

const defaultAttachmentInformation: SupportAttachmentFormModel = {
  id: undefined,
  newAttachment: undefined,
  attachments: [],
  attachmentList: [],
};

export const SupportErrandAttachmentsTab: FC<{
  update: () => void;
}> = (props) => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const supportAttachments = useSupportStore((s) => s.supportAttachments);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const [modalAttachment, setModalAttachment] = useState<SingleSupportAttachment>();
  const [addNewAttachment, setAddNewAttachment] = useState(false);
  const [modalFetching, setModalFetching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [addAttachmentWindowIsOpen, setAddAttachmentWindowIsOpen] = useState<boolean>(false);
  const [selectedAttachment, setSelectedAttachment] = useState<SupportAttachment>();
  const [attachmentTypeExists, setAttachmentTypeExists] = useState(false);
  const removeConfirm = useConfirm();
  const toastMessage = useSnackbar();
  const [dragDrop, setDragDrop] = useState<boolean>(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const modalFocus = useRef<HTMLButtonElement>(null);
  const setModalFocus = () => {
    setTimeout(() => {
      modalFocus.current && modalFocus.current.focus();
    });
  };

  const closeModal = async () => {
    await getSupportErrandById(supportErrand!.id!.toString(), municipalityId)
      .then((data) => setSupportErrand(data.errand))
      .catch((e) => {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message: `Något gick fel när ärendet skulle hämtas`,
          status: 'error',
        });
      });
    setIsOpen(false);
    setAddAttachmentWindowIsOpen(false);
    setDragDrop(false);
    setTimeout(() => setModalAttachment(undefined), 250);
  };
  const openModal = () => {
    setIsOpen(true);
    setModalFocus();
  };

  let formSchema = yup.object({
    id: yup.string(),
    newAttachment: yup.mixed(),
    attachments: yup.array().when('attachmentType', () => {
      return selectedAttachment ? yup.array() : yup.array().min(1).required('Fil måste bifogas');
    }),
  });

  const {
    register,
    control,
    trigger,
    watch,
    reset,
    setValue,
    getValues,
    formState,
    formState: { errors },
  } = useForm<SupportAttachmentFormModel>({
    resolver: yupResolver(formSchema) as any,
    defaultValues: defaultAttachmentInformation,
    mode: 'onChange', // NOTE: Needed if we want to disable submit until valid
  });

  const {
    fields: attachmentFields,
    append: appendAttachment,
    remove: removeAttachment,
  } = useFieldArray({
    control,
    name: 'attachments',
  });

  const attachments = watch('attachments');

  const downloadDocument = (a: SupportAttachment) => {
    getSupportAttachment(supportErrand!.id!.toString(), municipalityId, a)
      .then((att) => {
        const uri = `data:${a.mimeType};base64,${att.base64EncodedString}`;
        const link = document.createElement('a');
        link.href = uri;
        link.setAttribute('download', `${a.fileName}`);
        document.body.appendChild(link);
        link.click();
      })
      .catch(() => {
        setPdfError(true);
      });
  };

  useEffect(() => {
    const vals: SupportAttachmentFormModel = getValues();
    trigger();
    if (vals.attachments) {
      trigger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSizeError(false);
  }, [attachments]);

  useEffect(() => {
    if (!supportErrand?.id || !supportAttachments?.length) return;

    const errandId = supportErrand.id.toString();
    const imageAttachments = supportAttachments.filter(
      (att) => imageMimeTypes.includes(att.mimeType) && !thumbnails[att.id]
    );

    if (imageAttachments.length === 0) return;

    let isCancelled = false;

    const fetchAttachmentThumbnail = async (att: SupportAttachment) => {
      const res = await getSupportAttachment(errandId, municipalityId, att);
      return {
        id: att.id,
        dataUrl: `data:${att.mimeType};base64,${res.base64EncodedString}`,
      };
    };

    const fetchThumbnails = async () => {
      const batchSize = 3;
      for (let i = 0; i < imageAttachments.length; i += batchSize) {
        if (isCancelled) break;

        const batch = imageAttachments.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map(fetchAttachmentThumbnail));

        if (isCancelled) break;

        const newThumbnails: Record<string, string> = {};
        for (const result of results) {
          if (result.status === 'fulfilled') {
            newThumbnails[result.value.id] = result.value.dataUrl;
          }
        }

        if (Object.keys(newThumbnails).length > 0) {
          setThumbnails((prev) => ({ ...prev, ...newThumbnails }));
        }
      }
    };

    fetchThumbnails();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportErrand?.id, supportAttachments, municipalityId]);

  const openHandler = () => {
    setDragDrop(true);
    setSelectedAttachment(undefined);
    setAddAttachmentWindowIsOpen(true);
  };

  const closeHandler = () => {
    setAddAttachmentWindowIsOpen(false);
  };

  const clickHandler = (attachment: SupportAttachment) => {
    if (imageMimeTypes.includes(attachment.mimeType)) {
      setModalFetching(true);
      getSupportAttachment(supportErrand!.id!.toString(), municipalityId, attachment)
        .then((res) => setModalAttachment(res))
        .then(() => {
          setModalFetching(false);
        })
        .then(() => openModal());
    } else {
      downloadDocument(attachment);
    }
  };

  const onDelete = () => {
    removeConfirm.showConfirmation('Ta bort?', 'Vill du ta bort denna bilaga?').then((confirmed) => {
      if (confirmed) {
        return deleteSupportAttachment(supportErrand!.id!.toString(), municipalityId, selectedAttachment!.id!)
          ?.then(() => {
            props.update();
            reset();
          })
          .then(() => {
            setSelectedAttachment(undefined);
          })
          .then(() => {
            toastMessage(
              getToastOptions({
                message: 'Bilagan togs bort',
                status: 'success',
              })
            );
            setIsLoading(false);
          })
          .catch((e) => {
            toastMessage({
              position: 'bottom',
              closeable: false,
              message: 'Något gick fel när bilagan togs bort',
              status: 'error',
            });
            setIsLoading(false);
          });
      }
    });
  };

  const editAttachmentModal = (
    <Modal
      className="w-[84rem]"
      show={isOpen}
      onClose={closeModal}
      label={modalAttachment?.errandAttachmentHeader?.fileName}
    >
      <div className="flex-grow-0 my-md">
        <div className="flex flex-col justify-center items-center my-lg">
          {modalFetching ? (
            <Spinner size={24} />
          ) : (
            <Image
              alt={modalAttachment?.errandAttachmentHeader?.fileName}
              key={modalAttachment?.errandAttachmentHeader?.id}
              src={`data:${modalAttachment?.errandAttachmentHeader.mimeType};base64,${modalAttachment?.base64EncodedString}`}
            />
          )}
        </div>
      </div>
    </Modal>
  );

  return (
    <div className="w-full py-40 px-48 gap-32">
      <div className="w-full flex justify-between items-center flex-wrap h-40">
        <h2 className="text-h2-md max-medium-device:text-h4-md">Bilagor</h2>
        <div>
          <Input type="hidden" {...register('id')} />
          <Modal
            show={addAttachmentWindowIsOpen}
            className="w-[43rem]"
            onClose={() => {
              closeHandler();
              setSelectedAttachment(undefined);
              setAddNewAttachment(false);
              reset();
            }}
            label={'Ladda upp bilaga'}
          >
            <FileUploadWrapper>
              <Modal.Content>
                <FormControl id="attachment" className="w-full">
                  <FileUpload
                    key="attachments-tab"
                    fieldName="attachments"
                    fields={attachmentFields}
                    items={attachments}
                    uniqueFileUploaderKey="supporterrand-attachments-tab"
                    register={register}
                    setValue={setValue}
                    watch={watch}
                    errors={errors}
                    append={appendAttachment}
                    remove={removeAttachment}
                    editing={false}
                    accept={ACCEPTED_UPLOAD_FILETYPES}
                    helperText="Maximal filstorlek: 10 MB"
                    dragDrop={dragDrop}
                    allowMultiple={false}
                  />
                </FormControl>

                {attachmentTypeExists ? (
                  <FormErrorMessage className="my-sm text-error">
                    En bilaga av denna typ finns redan. För att lägga till en ny, ta först bort den gamla.
                  </FormErrorMessage>
                ) : null}
              </Modal.Content>

              <Modal.Footer>
                <Button
                  className="w-full"
                  disabled={!formState.isValid}
                  type="submit"
                  variant="primary"
                  color="primary"
                  loading={isLoading}
                  loadingText="Laddar upp"
                  onClick={(e) => {
                    e.preventDefault();
                    const vals: SupportAttachmentFormModel = getValues();
                    const attachmentsData: { file: File }[] = vals.attachments.map((a) => ({
                      file: a.file!,
                    }));
                    setIsLoading(true);
                    saveSupportAttachments(supportErrand!.id!.toString(), municipalityId, attachmentsData)
                      .then(() => props.update())
                      .then(() => setAddNewAttachment(false))
                      .then(() => setSelectedAttachment(undefined))
                      .then(() => setIsLoading(false))
                      .then(() => setError(false))
                      .then(() => setSizeError(false))
                      .then(() => {
                        reset();
                        setAddAttachmentWindowIsOpen(false);
                        setDragDrop(false);
                        toastMessage(
                          getToastOptions({
                            message: 'Bilagan sparades',
                            status: 'success',
                          })
                        );
                      })
                      .catch((e) => {
                        if (e.message === 'MAX_SIZE') {
                          toastMessage({
                            position: 'bottom',
                            closeable: false,
                            message: 'Max filstorlek överskreds',
                            status: 'error',
                          });
                          setSizeError(true);
                          setIsLoading(false);
                        } else {
                          toastMessage({
                            position: 'bottom',
                            closeable: false,
                            message: 'Bilagan gick inte att spara',
                            status: 'error',
                          });
                          setError(true);
                          setIsLoading(false);
                        }
                      });
                  }}
                >
                  Ladda upp
                </Button>
              </Modal.Footer>
            </FileUploadWrapper>
          </Modal>
          <Button
            data-cy="add-attachment-button"
            disabled={isSupportErrandLocked(supportErrand!) || supportErrandIsEmpty(supportErrand!)}
            color="vattjom"
            rightIcon={<Upload size={16} />}
            inverted
            size="sm"
            onClick={() => {
              setSizeError(false);
              setAddNewAttachment(true);
              setAttachmentTypeExists(false);
              reset();
              openHandler();
            }}
          >
            Ladda upp bilaga
          </Button>
        </div>
      </div>
      <div>
        <p className="py-8">Här samlas bilagor som är kopplade till ärendet.</p>
        {!supportAttachments?.length && (
          <>
            <Divider className="pt-16" />
            <p className="pt-24 text-dark-disabled">Inga bilagor har laddats upp</p>
          </>
        )}
      </div>
      {!isLoading ? (
        <div className="mt-md flex flex-col" data-cy="supportattachments-list">
          {supportAttachments?.map((attachment, key) => (
            <Fragment key={key}>
              <div
                data-cy={`attachment-${attachment.id}`}
                className={`attachment-item flex justify-between gap-12 rounded-sm p-12 text-md border-t`}
              >
                <div
                  className="flex gap-12 cursor-pointer items-center"
                  onClick={() => {
                    clickHandler(attachment);
                  }}
                >
                  {imageMimeTypes.includes(attachment.mimeType) && thumbnails[attachment.id] ? (
                    <Image
                      src={thumbnails[attachment.id]}
                      alt={attachment.fileName}
                      className="w-[48px] h-[48px] object-cover rounded"
                    />
                  ) : (
                    <div className={`self-center bg-vattjom-surface-accent p-12 rounded`}>
                      {(() => {
                        const DynIcon =
                          iconMap[documentMimeTypes.some((d) => d.includes(attachment.mimeType)) ? 'file' : 'image'];
                        return DynIcon ? <DynIcon className="block" size={24} /> : null;
                      })()}
                    </div>
                  )}
                  <div>
                    <p>
                      <strong>{attachment.fileName}</strong>{' '}
                    </p>
                    <div className="text-small">
                      <span>
                        <b>Uppladdad den: </b>{' '}
                        {dayjs((attachment as SupportAttachment & { created?: string }).created).format(
                          'YYYY-MM-DD HH:mm'
                        )}
                      </span>{' '}
                      {isKnownAttachmentChannel(attachment?.channel as string | undefined) && (
                        <span>
                          <b>Kanal: </b>{' '}
                          {getInvestigationChannelLabel(attachment?.channel as string | undefined) ??
                            getAttachmentChannelLabel(attachment?.channel as string | undefined)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="self-center relative">
                  <PopupMenu>
                    <PopupMenu.Button
                      size="sm"
                      variant="primary"
                      aria-label="Alternativ"
                      color="primary"
                      iconButton
                      inverted
                      onClick={() => setSelectedAttachment(attachment)}
                    >
                      <Ellipsis />
                    </PopupMenu.Button>
                    <PopupMenu.Panel>
                      <PopupMenu.Items>
                        <PopupMenu.Group>
                          <PopupMenu.Item>
                            <Button
                              data-cy={`open-attachment-${attachment.id}`}
                              leftIcon={<Eye />}
                              onClick={() => {
                                clickHandler(attachment);
                              }}
                            >
                              Öppna
                            </Button>
                          </PopupMenu.Item>
                        </PopupMenu.Group>
                        {!isSupportErrandLocked(supportErrand!) && (
                          <PopupMenu.Group>
                            <PopupMenu.Item>
                              <Button
                                data-cy={`delete-attachment-${attachment.id}`}
                                leftIcon={<Trash />}
                                onClick={onDelete}
                              >
                                Ta bort
                              </Button>
                            </PopupMenu.Item>
                          </PopupMenu.Group>
                        )}
                      </PopupMenu.Items>
                    </PopupMenu.Panel>
                  </PopupMenu>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <Spinner />
      )}
      {editAttachmentModal}
    </div>
  );
};
