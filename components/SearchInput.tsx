"use client";

import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type SearchInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  "className" | "onChange" | "value"
> & {
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
};

export default function SearchInput({
  className,
  value,
  onValueChange,
  ...props
}: SearchInputProps) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        {...props}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="清空搜索"
            onClick={() => onValueChange("")}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
