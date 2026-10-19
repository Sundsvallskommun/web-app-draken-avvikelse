import { Button } from '@sk-web-gui/react';
import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main>
      <div className="flex flex-col items-center justify-center min-h-screen gap-16 p-24">
        <div className="flex flex-col items-center gap-16 max-w-lg text-center">
          <h1 className="text-h1-sm md:text-h1-md">404</h1>
          <h2 className="text-h3-sm md:text-h3-md">Sidan hittades inte</h2>
          <p className="text-large text-dark-secondary">Sidan du letar efter finns inte eller har flyttats.</p>
          <Link href="/oversikt">
            <Button color="vattjom">Gå till översikten</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
