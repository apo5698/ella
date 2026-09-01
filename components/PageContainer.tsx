import { cn } from "@/lib/utils";

export default function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl", className)} {...props} />
  );
}
