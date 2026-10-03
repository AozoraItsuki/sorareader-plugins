import React from 'react';
import { Menu, Moon, Sun } from 'lucide-react';

import { Plugin } from '@/types/plugin';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

type PluginHeaderProps = {
  selectedPlugin?: Plugin.PluginBase;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
};

export default function PluginHeader({
  selectedPlugin,
  onToggleSidebar,
  isSidebarOpen,
}: PluginHeaderProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';

  return (
    // The header owns the top safe-area inset. The row below carries the
    // horizontal insets, and the content row inside it keeps its responsive
    // `px-*`/`py-*` — keeping the three on separate elements is what lets them
    // add up instead of overwriting each other.
    <header className="shrink-0 border-b border-border pt-safe">
      <div className="px-safe">
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {onToggleSidebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                className="h-11 w-11 shrink-0 md:hidden"
                aria-label="Toggle plugin list"
                aria-expanded={isSidebarOpen}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-soft)] text-xl font-semibold text-[var(--color-accent-strong)] transition-colors">
              読
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">
                Plugin Playground
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {selectedPlugin?.name}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-11 w-11 shrink-0 md:h-9 md:w-9"
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
          >
            {isDark ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
