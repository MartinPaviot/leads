interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Shape applied to an uploaded image. "circle" (default) suits people — a
   * face reads well in a round frame. "square" is for brand/workspace logos:
   * a circular crop clips the corners of a non-circular mark and alters it, so
   * the logo is left un-rounded and shown as-is (object-contain already
   * letterboxes it, it never crops the artwork itself). The no-image initials
   * bubble always stays round — it's a soft placeholder, not the logo.
   */
  shape?: "circle" | "square";
}

const sizeMap = { sm: 24, md: 32, lg: 40 };
const textSize = { sm: "text-[9px]", md: "text-[11px]", lg: "text-[13px]" };
const radiusClass = { circle: "rounded-full", square: "rounded-none" } as const;

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ src, name = "?", size = "md", className = "", shape = "circle" }: AvatarProps) {
  const px = sizeMap[size];
  const radius = radiusClass[shape];

  if (src) {
    return (
      <>
        {/* No backdrop behind a real image — an uploaded logo or photo
            replaces the gradient bubble entirely (the gradient is the
            no-image fallback, never a frame around an image).
            object-contain (not cover) so non-square logos aren't cropped;
            transparent areas show the surface behind, like any plain logo.
            radius follows `shape`: round for faces, square (un-rounded) for
            logos so a brand mark is shown as-is, never clipped to a circle. */}
        <img
          src={src}
          alt={name}
          className={`shrink-0 ${radius} object-contain ${className}`}
          style={{ width: px, height: px }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        {/* Revealed by the img onError handler — a broken avatar/logo URL
            degrades to the initials bubble instead of an empty gap. Always
            round: the bubble is a placeholder, never the brand mark itself. */}
        <div
          className={`gradient-brand shrink-0 items-center justify-center rounded-full font-semibold text-white ${textSize[size]} ${className}`}
          style={{ width: px, height: px, display: "none" }}
          title={name}
        >
          {getInitials(name)}
        </div>
      </>
    );
  }

  // No image: the gradient initials bubble. Always round — a soft identity
  // placeholder, independent of `shape` (which only governs an uploaded logo).
  return (
    <div
      className={`gradient-brand flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${textSize[size]} ${className}`}
      style={{ width: px, height: px }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
