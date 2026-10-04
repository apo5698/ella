import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder cards in the grid's shape, while a page loads. */
export default function ListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1760px]:grid-cols-5"
    >
      {Array.from({ length: rows * 5 }, (_, index) => (
        <div
          key={index}
          className={
            index >= rows * 4
              ? "hidden flex-col gap-2.5 min-[1760px]:flex"
              : "flex flex-col gap-2.5"
          }
        >
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
