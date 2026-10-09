import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Ref } from 'react';

export function OptionSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  invalid,
  required,
  inputRef,
  onBlur,
}: {
  id?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  inputRef?: Ref<HTMLButtonElement>;
  onBlur?: () => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        ref={inputRef}
        onBlur={onBlur}
        aria-label={label}
        aria-invalid={invalid}
        aria-required={required}
        className='w-full'
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
