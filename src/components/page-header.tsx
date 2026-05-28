import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
  descriptionClassName?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 pb-7 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#D8B46A]">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-[#F4EFE7] sm:text-5xl">
          {title}
        </h1>
        <p
          className={cn(
            "mt-4 text-base leading-8 text-[#AAB4C3] md:text-lg",
            descriptionClassName,
          )}
        >
          {description}
        </p>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-3">{children}</div> : null}
    </header>
  );
}
