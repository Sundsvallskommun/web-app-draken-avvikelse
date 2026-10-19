'use client';

// Inline styles används medvetet här. global-error.tsx fångar fel i root layout,
// vilket innebär att Tailwind CSS, GuiProvider och alla providers kan ha kraschat.
// Inline styles garanterar att felsidan alltid renderas korrekt.
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="sv">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            gap: '16px',
            padding: '24px',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Ett oväntat fel uppstod</h1>
          <p style={{ color: '#555', margin: 0 }}>Applikationen kunde inte laddas. Prova att ladda om sidan.</p>
          {error.digest && (
            <p style={{ color: '#999', fontSize: '0.875rem', margin: 0 }}>Felreferens: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '12px 24px',
              backgroundColor: '#005595',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Ladda om
          </button>
        </div>
      </body>
    </html>
  );
}
