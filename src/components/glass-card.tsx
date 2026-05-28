import { cn } from "@/lib/utils";

type GlassCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-white/12 bg-white/[0.06] shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.075]",
        className,
      )}
    >
      {children}
    </section>
  );
}
