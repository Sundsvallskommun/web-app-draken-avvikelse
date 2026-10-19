import { Spinner } from '@sk-web-gui/react';

export default function ErrandLoading() {
  return (
    <div className="bg-background-100 h-screen min-h-screen max-h-screen overflow-hidden w-full flex flex-col">
      <div className="flex items-center justify-center grow">
        <Spinner size={12} aria-label="Laddar ärende" />
      </div>
    </div>
  );
}
