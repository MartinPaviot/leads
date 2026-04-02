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
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ${className}`}
        style={{ width: px, height: px }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
        }}
      />
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
