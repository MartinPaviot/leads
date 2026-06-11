interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: 24, md: 32, lg: 40 };
const textSize = { sm: "text-[9px]", md: "text-[11px]", lg: "text-[13px]" };

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ src, name = "?", size = "md", className = "" }: AvatarProps) {
  const px = sizeMap[size];

  if (src) {
    return (
      <>
        {/* No backdrop behind a real image — an uploaded logo or photo
            replaces the gradient bubble entirely (the gradient is the
            no-image fallback, never a frame around an image).
            object-contain (not cover) so non-square logos aren't cropped;
            transparent areas show the surface behind, like any plain logo. */}
        <img
          src={src}
          alt={name}
          className={`shrink-0 rounded-full object-contain ${className}`}
          style={{ width: px, height: px }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        {/* Revealed by the img onError handler — a broken avatar/logo URL
            degrades to the initials bubble instead of an empty gap. */}
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
