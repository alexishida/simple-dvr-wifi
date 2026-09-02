interface IconProps {
  size?: number;
}

function icon(children: React.ReactNode) {
  return function Icon({ size = 20 }: IconProps): React.JSX.Element {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const DashboardIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
);

export const CameraIcon = icon(
  <>
    <path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h9A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15.5v-7Z" />
    <path d="m16 10 4-2.5v9L16 14" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
);

export const RecIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </>,
);

export const ImageIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m3 17 5-5 4 4 3-3 6 5" />
  </>,
);

export const ActivityIcon = icon(
  <>
    <path d="M3 12h4l2.5-7 5 14L17 12h4" />
  </>,
);

export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </>,
);

export const WifiIcon = icon(
  <>
    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <circle cx="12" cy="20" r="1" fill="currentColor" />
  </>,
);

export const VideoIcon = icon(
  <>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="m22 9-6 3 6 3V9Z" />
  </>,
);

export const KeyIcon = icon(
  <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 8.3-8.3M15 8l3 3" />
  </>,
);

export const BoltIcon = icon(
  <>
    <path d="M13 2 3 14h7l-1 8 11-13h-7l1-7Z" />
  </>,
);

export const PlusIcon = icon(
  <>
    <path d="M12 5v14M5 12h14" />
  </>,
);

export const EditIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" />
  </>,
);

export const MoveIcon = icon(
  <>
    <path d="M12 3v18M3 12h18" />
    <path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
  </>,
);

export const CheckIcon = icon(<path d="m5 12 4 4L19 6" />);

export const CloseIcon = icon(
  <>
    <path d="m6 6 12 12M18 6 6 18" />
  </>,
);

export const TrashIcon = icon(
  <>
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
    <path d="M10 11v5M14 11v5" />
  </>,
);

export const PowerIcon = icon(
  <>
    <path d="M12 3v9" />
    <path d="M6.3 5.8a8 8 0 1 0 11.4 0" />
  </>,
);

export const BlockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m6 6 12 12" />
  </>,
);

export const MaximizeIcon = icon(
  <>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </>,
);

export const MinimizeIcon = icon(
  <>
    <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
  </>,
);
