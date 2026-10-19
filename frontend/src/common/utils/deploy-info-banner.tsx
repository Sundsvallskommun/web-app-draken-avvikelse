'use client';

import { useEffect, useState } from 'react';

type DeployInfo = {
  commit: string;
  branch: string;
  updatedAt: string;
  commitUrl?: string;
};

// Prevents build-time dead code elimination by using .includes() which Terser cannot statically evaluate.
// In CICD builds, the inlined placeholder string is replaced by entrypoint.sh at container startup.
const showDeployInfo = ['true'].includes(process.env.NEXT_PUBLIC_SHOW_DEPLOY_INFO ?? '');

export function DeployInfoBanner() {
  const [info, setInfo] = useState<DeployInfo | null>(null);

  useEffect(() => {
    if (showDeployInfo) {
      const basePath = window.location.pathname.split('/')[1];
      const baseUrl = basePath ? `/${basePath}` : '';
      const url = `${baseUrl}/deploy-info.json`;

      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('404');
          return res.json();
        })
        .then((data) => {
          setInfo(data);
        })
        .catch((err) => console.warn('Kunde inte läsa deploy-info.json', url, err));
    }
  }, []);

  if (!info) return null;

  return (
    <div className="fixed bottom-0 right-0 px-[1rem] py-[0.6rem] bg-background-200 text-[1.2rem] rounded-tl-[0.8rem] z-[9999]">
      <div>
        <strong>Branch:</strong> {info.branch}
      </div>
      <div>
        <strong>Commit:</strong>{' '}
        {info.commitUrl ? (
          <a href={info.commitUrl} target="_blank" rel="noopener noreferrer">
            {info.commit.slice(0, 7)}
          </a>
        ) : (
          info.commit.slice(0, 7)
        )}
      </div>
      <div>
        <strong>Updated:</strong> {new Date(info.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
