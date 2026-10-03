import React from 'react';
import { Copy, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plugin } from '@/types/plugin';

type NovelCardProps = {
  novel: Plugin.NovelItem;
  onParse: (path: string) => void;
};

export function NovelCard({ novel, onParse }: NovelCardProps) {
  const handleCopyPath = () => {
    navigator.clipboard.writeText(novel.path);
    toast.success('Novel path copied!');
  };

  return (
    <div className="group cursor-pointer flex flex-col h-full">
      <div className="relative mb-2 overflow-hidden rounded-lg bg-muted aspect-[3/4]">
        <img
          src={novel.cover || '/static/coverNotAvailable.webp'}
          alt={novel.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* No fixed height here: `h-10` fought `line-clamp-2` and clipped the
            second line on narrow cards. `line-clamp-2` owns the height. */}
        <h3 className="mb-2 line-clamp-2 text-sm font-medium leading-tight text-foreground">
          {novel.name}
        </h3>
        <div className="mt-auto flex gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 bg-transparent px-2 pointer-coarse:h-11"
                onClick={handleCopyPath}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy path</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-8 flex-1 px-2 pointer-coarse:h-11"
                onClick={() => onParse(novel.path)}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Parse novel</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
