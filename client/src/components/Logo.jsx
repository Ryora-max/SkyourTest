export default function Logo({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28',
  };

  return (
    <div
      className={`${sizes[size]} text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Left wing - 3 curved lines spreading out */}
        <path d="M30 35 Q18 38 10 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M32 50 Q17 50 6 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
        <path d="M30 65 Q18 62 10 58" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />

        {/* Right wing - 3 curved lines spreading out */}
        <path d="M70 35 Q82 38 90 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M68 50 Q83 50 94 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
        <path d="M70 65 Q82 62 90 58" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />

        {/* Shield outline */}
        <path
          d="M50 18 L72 26 L72 52 Q72 68 50 82 Q28 68 28 52 L28 26 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Check mark that flows into S shape inside shield */}
        <path
          d="M38 48 Q34 42 40 38 Q48 34 52 42 Q54 50 48 54 Q42 58 44 64 Q48 68 56 64"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
