import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export default function LoadingSpinner({
  className,
  label = "加载中",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-1 items-center justify-center",
        className,
      )}
    >
      <Spinner className="size-8" aria-label={label} />
    </div>
  );
}
