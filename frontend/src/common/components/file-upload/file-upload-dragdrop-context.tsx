import { cx } from '@sk-web-gui/react';
import { UploadCloud } from 'lucide-react';
import { createContext, DragEvent, FC, ReactNode, useContext, useState } from 'react';
interface UseFileUploadProps {
  setActive?: (active: boolean) => void;
  setIsDragging?: (active: boolean) => void;
  drop?: FileList | null;
  setDrop?: (list: FileList | null) => void;
}

const FileUploadContext = createContext<UseFileUploadProps>({});

export const useFileUpload = () => useContext(FileUploadContext);

interface FileUploadWrapperProps {
  children?: ReactNode;
}

export const FileUploadWrapper: FC<FileUploadWrapperProps> = ({ children }) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [active, setActive] = useState<boolean>(false);
  const [drop, setDrop] = useState<FileList | null>(null);

  const handleDragFile = (event: DragEvent<HTMLDivElement>) => {
    if (active) {
      event.preventDefault();
      setIsDragging(true);
    }
  };
  const handleDragFileEnd = (event: DragEvent<HTMLDivElement>) => {
    setIsDragging(false);
    event.preventDefault();
  };

  const handleDropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      setDrop(event.dataTransfer.files);
    }
    setIsDragging(false);
  };

  const context: UseFileUploadProps = {
    setIsDragging,
    setActive,
    drop,
    setDrop,
  };

  return (
    <FileUploadContext.Provider value={context}>
      <div onDragEnter={handleDragFile}>{children}</div>
      {isDragging && (
        // <div className={`absolute z-overlay top-0 left-0 right-0 bg-red-800 ${isDragging ? 'block' : 'hidden'}`}>
        <div
          className={cx(
            'fixed',
            'top-0',
            'bottom-0',
            'left-0 ',
            'right-0',
            'bg-primitives-overlay-darken-6',
            'p-32',
            'rounded-20',
            'border-4 border-gronsta-text-primary',
            isDragging ? 'block' : 'hidden',
            'z-overlay'
          )}
          onDrop={handleDropFile}
          onDragOver={handleDragFile}
          onDragLeave={handleDragFileEnd}
          onClick={() => setIsDragging(false)}
        >
          <div
            className={cx(
              'w-full h-full',
              'border-dashed border-4 border-gronsta-text-primary',
              'flex items-center justify-center',
              'text-gronsta-text-primary'
            )}
          >
            <UploadCloud className="rounded-full bg-gronsta-surface-accent p-16 h-40 w-40 md:h-[8rem] md:w-[8-rem] xl:h-[12rem] xl:w-[12rem]" />
          </div>
        </div>
        // </div>
      )}
    </FileUploadContext.Provider>
  );
};
