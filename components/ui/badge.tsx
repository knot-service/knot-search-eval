import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const badgeVariants = cva(
  "tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:leading-none tw:whitespace-nowrap",
  { variants: { variant: {
    success: "tw:bg-emerald-50 tw:text-emerald-700",
    danger: "tw:bg-red-50 tw:text-red-700",
    warning: "tw:bg-amber-50 tw:text-amber-700",
    muted: "tw:bg-slate-100 tw:text-slate-600",
    info: "tw:bg-indigo-50 tw:text-indigo-700",
  } }, defaultVariants: { variant: "muted" } },
);

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={twMerge(clsx(badgeVariants({ variant }), className))} {...props} />;
}
