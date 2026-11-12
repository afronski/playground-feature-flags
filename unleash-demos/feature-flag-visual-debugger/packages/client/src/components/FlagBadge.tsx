interface FlagBadgeProps {
  variant: string;
  flagKey?: string;
}

export default function FlagBadge({ variant, flagKey }: FlagBadgeProps) {
  const isEnabled = variant === 'enabled';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${
        isEnabled
          ? 'bg-green-900/60 text-green-300 border border-green-700/50'
          : 'bg-gray-700/60 text-gray-400 border border-gray-600/50'
      }`}
      title={flagKey ? `${flagKey}: ${variant}` : variant}
    >
      <span className="text-[10px]">{'\u2691'}</span>
      {variant}
    </span>
  );
}
