import type { SVGProps } from "react";

function Icon({ d, strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d={d} />
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const ChevronLeftIcon = (props: IconProps) => <Icon d="M15 19l-7-7 7-7" {...props} />;
export const CloseIcon = (props: IconProps) => <Icon d="M6 18L18 6M6 6l12 12" {...props} />;
export const InfoIcon = (props: IconProps) => (
  <Icon d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" {...props} />
);
export const CheckCircleIcon = (props: IconProps) => (
  <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" {...props} />
);
export const PhotoIcon = (props: IconProps) => (
  <Icon
    strokeWidth={1.5}
    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    {...props}
  />
);

export const CameraIcon = (props: IconProps) => (
  <Icon
    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z"
    {...props}
  />
);

export function SpinnerIcon(props: IconProps) {
  return (
    <svg fill="none" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
