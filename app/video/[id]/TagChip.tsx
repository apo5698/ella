"use client";

import { Check, X } from "lucide-react";
import { TagBadge } from "@/components/tags/TagBadge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * A content tag. Clicking reveals accept/reject actions; an already-accepted
 * (manual) tag only offers reject, since accepting it again is a no-op.
 */
export default function TagChip({
  name,
  source,
  onAccept,
  onReject,
}: {
  name: string;
  source: string;
  onAccept: (name: string) => void;
  onReject: (name: string) => void;
}) {
  const accepted = source === "manual";

  return (
    <Popover>
      {/* The badge renders a real <button>: Base UI needs native button
          semantics on the trigger, and a span would drop them. */}
      <PopoverTrigger
        render={
          <TagBadge
            source={source}
            render={<button type="button" />}
            className="cursor-pointer"
          />
        }
      >
        {name}
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-auto gap-1 p-1">
        {!accepted && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onAccept(name)}
            title="标记为已审核"
            className="text-muted-foreground hover:text-success"
          >
            <Check />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onReject(name)}
          title={accepted ? "移除标签" : "排除标签"}
          className="text-muted-foreground hover:text-destructive"
        >
          <X />
        </Button>
      </PopoverContent>
    </Popover>
  );
}
