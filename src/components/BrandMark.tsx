export function BrandMark({
  dark = false,
  size = 'md',
}: {
  dark?: boolean;
  size?: 'sm' | 'md';
}) {
  const iconDim = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const textClass = size === 'sm' ? 'text-base' : 'text-lg';
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className={`${iconDim} shrink-0`}
        aria-hidden="true"
      >
        <rect
          width="36"
          height="36"
          rx="8"
          fill={dark ? '#0F766E' : '#0B1F3A'}
        />
        <path
          d="M6 24.5C9.5 16.5 14 13 18 13C22 13 26.5 16.5 30 24.5"
          stroke="#F8FAFC"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M11 24.5V17.5M18 24.5V13M25 24.5V17.5"
          stroke="#C59B27"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="5"
          y1="25.5"
          x2="31"
          y2="25.5"
          stroke="#2DD4BF"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`font-display font-bold tracking-tight ${textClass} ${
          dark ? 'text-white' : 'text-slate-900'
        }`}
      >
        Virasat Setu
      </span>
    </span>
  );
}
