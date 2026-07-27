import Image from "next/image";

export function ProductIcon() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src="/clavisflow-studio-icon.png" alt="" width={32} height={32} priority unoptimized />
    </span>
  );
}
