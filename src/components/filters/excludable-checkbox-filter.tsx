import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';

type ExcludableCheckboxFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.ExcludableCheckboxGroup>;
  };
  value: {
    include?: string[];
    exclude?: string[];
  };
  set: (value: { include?: string[]; exclude?: string[] }) => void;
};

type CheckState = 'unchecked' | 'included' | 'excluded';

export function ExcludableCheckboxFilter({
  filter,
  value,
  set,
}: ExcludableCheckboxFilterProps) {
  const getState = (optionValue: string): CheckState => {
    if (value.include?.includes(optionValue)) return 'included';
    if (value.exclude?.includes(optionValue)) return 'excluded';
    return 'unchecked';
  };

  const toggleOption = (optionValue: string) => {
    const currentState = getState(optionValue);
    let newInclude = value.include || [];
    let newExclude = value.exclude || [];

    switch (currentState) {
      case 'unchecked':
        // Unchecked -> Included
        newInclude = [...newInclude, optionValue];
        break;
      case 'included':
        // Included -> Excluded
        newInclude = newInclude.filter(v => v !== optionValue);
        newExclude = [...newExclude, optionValue];
        break;
      case 'excluded':
        // Excluded -> Unchecked
        newExclude = newExclude.filter(v => v !== optionValue);
        break;
    }

    set({ include: newInclude, exclude: newExclude });
  };

  return (
    <div className="min-w-0 space-y-3">
      <Label className="break-anywhere text-sm font-medium">
        {filter.filter.label}
      </Label>
      <div className="space-y-2">
        {filter.filter.options.map(option => {
          const state = getState(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleOption(option.value)}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors pointer-coarse:min-h-11 hover:bg-muted/50"
            >
              <span className="min-w-0 break-anywhere text-foreground">
                {option.label}
              </span>
              {state === 'included' && (
                <Badge variant="default" className="shrink-0 text-xs">
                  Include
                </Badge>
              )}
              {state === 'excluded' && (
                <Badge variant="destructive" className="shrink-0 text-xs">
                  Exclude
                </Badge>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Click once to include, twice to exclude, three times to reset
      </p>
    </div>
  );
}
