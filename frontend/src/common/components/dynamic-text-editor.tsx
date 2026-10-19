import dynamic from 'next/dynamic';

const DynamicTextEditor = dynamic(() => import('@sk-web-gui/text-editor'), {
  ssr: false,
  loading: () => <div className="h-[15rem] w-full animate-pulse bg-gray-100 rounded" />,
});

export default DynamicTextEditor;
