import { ErrandPageClient } from './errand-page-client';

interface ArendePageProps {
  params: Promise<{ errandNumber: string; locale: string }>;
}

export default async function ArendePage({ params }: Readonly<ArendePageProps>) {
  const { errandNumber } = await params;
  return <ErrandPageClient errandNumber={errandNumber} />;
}
