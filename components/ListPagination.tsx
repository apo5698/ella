"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PageSizeControl = {
  value: number;
  options: readonly number[];
  onChange: (pageSize: number) => void;
  label: string;
};

export default function ListPagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  buttonSize = "default",
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: PageSizeControl;
  buttonSize?: "default" | "sm";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-foreground",
        className,
      )}
    >
      {pageSize && (
        <>
          <span>{pageSize.label}</span>
          <Select
            value={String(pageSize.value)}
            onValueChange={(value) => pageSize.onChange(Number(value))}
          >
            <SelectTrigger size="sm" aria-label={pageSize.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pageSize.options.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </>
      )}

      <span
        className={cn(
          "text-xs font-medium tabular-nums text-foreground",
          pageSize && "ml-auto",
        )}
      >
        第 {page} / {totalPages} 页
      </span>
      <Button
        variant="outline"
        size={buttonSize}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        size={buttonSize}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}
