interface IframePaneProps {
  src: string;
  title: string;
}

export default function IframePane({ src, title }: IframePaneProps) {
  return (
    <iframe
      src={src}
      title={title}
      className="w-full h-full border-0"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      allow="clipboard-write"
    />
  );
}
