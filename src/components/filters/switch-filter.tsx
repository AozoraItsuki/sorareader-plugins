import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';

type SwitchFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.Switch>;
  };
  value: boolean;
  set: (value: boolean) => void;
};

export function SwitchFilter({ filter, value, set }: SwitchFilterProps) {
  return (
    // The 24px-tall switch itself cannot reach 44px without looking broken, so
    // the tappable row does.
    <div className="flex min-w-0 items-center justify-between gap-2 py-2 pointer-coarse:min-h-11">
      <Label
        htmlFor={filter.key}
        className="min-w-0 cursor-pointer break-anywhere text-sm font-medium"
      >
        {filter.filter.label}
      </Label>
      <Switch id={filter.key} checked={value} onCheckedChange={set} />
    </div>
  );
}
