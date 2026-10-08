import Image from "next/image";
import Link from "next/link";
import icon from "../icon.svg";

export function LogoMark({ size }: { size: number }) {
  return <Image src={icon} alt="" width={size} height={size} priority />;
}

/** Logo and wordmark, linking home. */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <LogoMark size={32} />
      <span className="font-display text-xl font-semibold tracking-tight text-brand-900">Word Counter</span>
    </Link>
  );
}
