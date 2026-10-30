import Image from "next/image";

export function Cover({ src, alt, width, height, radius = 16, priority, sizes }: { src: string | null; alt: string; width: number | string; height: number; radius?: number; priority?: boolean; sizes?: string }) {
  return (
    <span className="cover" style={{ width, height, borderRadius: radius, display: "block" }}>
      {src ? <Image src={src} alt={alt} fill sizes={sizes ?? (typeof width === "number" ? `${width}px` : "50vw")} priority={priority} /> : null}
    </span>
  );
}
