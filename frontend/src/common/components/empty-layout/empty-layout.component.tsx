import { ReactNode } from 'react';
interface EmptyLayoutProps {
  children: ReactNode;
}

export default function EmptyLayout({ children }: EmptyLayoutProps) {
  return (
    <div className="EmptyLayout bg-background-200 text-body">
      <div className="min-h-screen">{children}</div>
    </div>
  );
}
