import type { ReactNode } from "react";

/*
 * Line icons in the Moon style: 24px grid, 2px round strokes, currentColor
 * (same helper and paths as Moon Explorer's, Moon Browser's and MoonTask's icons.tsx).
 */
function Svg({
  children,
  size = 16,
  stroke = 2,
}: {
  children: ReactNode;
  size?: number;
  stroke?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const BackIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const UpIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ReloadIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
);

export const CloseIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const PlusIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const HomeIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="m3 11 9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Svg>
);

export const SearchIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const MoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
  </Svg>
);

export const StarIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
  </Svg>
);

export const SettingsIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Svg>
);

export const ChevronRightIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const FolderIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

export const FileIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const ImageIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-9 9" />
  </Svg>
);

export const MediaIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);

export const CodeIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </Svg>
);

export const ArchiveIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
);

export const DownloadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);

export const EditIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const UploadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />
  </Svg>
);

export const CheckIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const SparklesIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m10 4 1.8 4.7L16.5 10.5l-4.7 1.8L10 17l-1.8-4.7-4.7-1.8 4.7-1.8Z" />
    <path d="M18.5 15v5M16 17.5h5" />
  </Svg>
);

export const LockIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="4.5" y="11" width="15" height="10" rx="2" />
    <path d="M8 11V7.5a4 4 0 0 1 8 0V11M12 15v2" />
  </Svg>
);

/* ---- Moon Zip ---- */

export const ExtractIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="3" width="18" height="5" rx="1.5" />
    <path d="M5 8v4M19 8v4M12 11v9M8.5 16.5 12 20l3.5-3.5" />
  </Svg>
);

export const CompressIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="14" width="18" height="7" rx="1.5" />
    <path d="M12 3v8M8.5 7.5 12 11l3.5-3.5M10 17.5h4" />
  </Svg>
);

export const TrashIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
);

export const ShieldCheckIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const InfoIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const HashIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
  </Svg>
);

export const OpenIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
    <path d="M3 7v10a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 11H7.5a2 2 0 0 0-1.9 1.4L3 19" />
  </Svg>
);

export const AlertIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 4 2.5 20h19Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const SunIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const CopyIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Svg>
);
