import { Spinner } from '@sk-web-gui/react';

import EmptyLayout from '../empty-layout/empty-layout.component';

export default function LoaderFullScreen() {
  return (
    <EmptyLayout>
      <main>
        <div className="w-screen h-screen flex place-items-center place-content-center">
          <Spinner size={12} aria-label="Laddar information" />
        </div>
      </main>
    </EmptyLayout>
  );
}
