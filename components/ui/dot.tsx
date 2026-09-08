import { cn } from "@/lib/utils"

function Dot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dot"
      className={cn("inline-block size-1 shrink-0 rounded-full", className)}
      {...props}
    />
  )
}

export { Dot }
