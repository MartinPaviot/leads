"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "gradient" | "solid" | "outline" | "ghost" | "destructive" | "icon";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1",
  md: "h-8 px-3.5 text-[13px] gap-1.5",
  lg: "h-10 px-5 text-[14px] gap-2",
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "solid", size = "md", loading, icon, children, className = "", disabled, style, ...props }, ref) => {
    const isIcon = variant === "icon";
    const isDisabled = disabled || loading;

    const base = "inline-flex items-center justify-center font-semibold rounded-md transition-all duration-150 ease-out cursor-pointer select-none whitespace-nowrap";
    const disabledClass = isDisabled ? "opacity-50 pointer-events-none" : "";

    let variantStyle: React.CSSProperties = {};
    let variantClass = "";

    switch (variant) {
      case "gradient":
        variantStyle = {
          background: "var(--gradient-brand)",
          backgroundSize: "120% 100%",
          backgroundPosition: "center",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "var(--shadow-button)",
        };
        variantClass = "hover:brightness-110 active:brightness-95";
        break;
      case "solid":
        variantStyle = {
          background: "var(--color-accent)",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "var(--shadow-button)",
        };
        variantClass = "hover:opacity-90 active:opacity-80";
        break;
      case "outline":
        variantStyle = {
          background: "transparent",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border-default)",
        };
        variantClass = "hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-hover)]";
        break;
      case "ghost":
        variantStyle = {
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "1px solid transparent",
        };
        variantClass = "hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]";
        break;
      case "destructive":
        variantStyle = {
          background: "var(--color-error)",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "var(--shadow-button)",
        };
        variantClass = "hover:opacity-90 active:opacity-80";
        break;
      case "icon":
        variantStyle = {
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "1px solid transparent",
        };
        variantClass = "hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]";
        break;
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`${base} ${isIcon ? iconSizeClasses[size] : sizeClasses[size]} ${variantClass} ${disabledClass} ${className}`}
        style={{ ...variantStyle, ...style }}
        {...props}
      >
        {loading ? (
          <Loader2 size={size === "sm" ? 12 : size === "lg" ? 18 : 14} className="animate-spin" />
        ) : icon ? (
          icon
        ) : null}
        {!isIcon && children}
      </button>
    );
  }
);

Button.displayName = "Button";
