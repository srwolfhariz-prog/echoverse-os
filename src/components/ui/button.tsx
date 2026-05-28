import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-[#D8B46A]/50 focus-visible:ring-[3px] focus-visible:ring-[#D8B46A]/20",
  {
    variants: {
      variant: {
        default:
          "bg-[#F4EFE7] text-[#11131e] shadow-[0_18px_50px_rgba(216,180,106,0.18)] hover:bg-[#FFF4D8]",
        premium:
          "bg-[linear-gradient(135deg,#D8B46A_0%,#D8A7B1_52%,#8B7CF6_100%)] text-[#11131e] shadow-[0_20px_60px_rgba(216,180,106,0.24)] hover:brightness-110",
        glass:
          "border border-white/12 bg-white/[0.06] text-[#F4EFE7] shadow-[0_18px_52px_rgba(0,0,0,0.18)] backdrop-blur-xl hover:border-[#D8B46A]/35 hover:bg-white/[0.09]",
        ghost: "text-[#F4EFE7] hover:bg-white/[0.07]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
