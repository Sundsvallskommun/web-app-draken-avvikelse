'use client';

import { Button } from '@sk-web-gui/react';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Logga felet till konsolen (ersätt med extern felrapportering vid behov)
    console.error('Ohanterat fel:', error);
  }, [error]);

  return (
    <main>
      <div className="flex flex-col items-center justify-center min-h-screen gap-16 p-24">
        <div className="flex flex-col items-center gap-16 max-w-lg text-center">
          <TriangleAlert className="w-48 h-48 text-error" />
          <h1 className="text-h2-sm md:text-h2-md">Något gick fel</h1>
          <p className="text-large text-dark-secondary">
            Ett oväntat fel uppstod. Du kan försöka igen eller gå tillbaka till översikten.
          </p>
          {error.digest && <p className="text-small text-dark-disabled">Felreferens: {error.digest}</p>}
          <div className="flex gap-16">
            <Button color="vattjom" onClick={reset}>
              Försök igen
            </Button>
            <Button variant="tertiary" color="vattjom" onClick={() => (globalThis.window.location.href = '/')}>
              Gå till översikten
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
