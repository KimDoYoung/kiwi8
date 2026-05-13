import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        secondary: "bg-muted text-muted-foreground",
        outline: "border border-input bg-background text-foreground",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-emerald-100 text-emerald-800",
        warning: "bg-amber-100 text-amber-800",
        info: "bg-sky-100 text-sky-800",
      },
      size: {
        default: "h-5",
        sm: "h-4 px-2 text-[10px]",
        lg: "h-6 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge(
  {
    className,
    variant,
    size,
    ...props
  }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>
) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
