import React, { useMemo, useState, useCallback, useEffect } from 'react';

import { BookOpen, Search, Settings, Zap } from 'lucide-react';
import PluginHeader from '../components/plugin-header';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

import plugins from '@plugins/index';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import { Plugin } from '@/types/plugin';
import PopularNovelsSection from '@/components/popular-novels';
import SearchNovelsSection from '@/components/search-novels';
import ParseNovelSection from '@/components/parse-novel';
import SettingsSection from '@/components/settings';
import ParseChapterSection from '@/components/parse-chapter';

type PluginSidebarProps = {
  isOpen: boolean;
  onSelect: () => void;
};

function PluginSidebar({ isOpen, onSelect }: PluginSidebarProps) {
  const { plugin, selectPlugin } = useAppStore(state => state);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlugins = useMemo(
    () =>
      plugins.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery],
  );

  const handleSelect = (p: Plugin.PluginItem) => {
    selectPlugin(p);
    // On narrow screens the drawer sits on top of the content, so selecting a
    // plugin has to reveal the content rather than leave the drawer covering it.
    onSelect();
  };

  return (
    <aside
      // `md` and up: a static 256px column in the flex row, exactly as before.
      // Below `md`: a fixed overlay drawer. Closed it is off-screen, hidden and
      // non-interactive, so it cannot be tabbed into or announced by a screen
      // reader. `visibility: hidden` is what removes it from both.
      className={cn(
        'z-40 flex w-64 shrink-0 flex-col border-r border-border bg-background pl-safe',
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[min(80vw,20rem)]',
        'max-md:pt-safe max-md:pb-safe max-md:shadow-xl',
        'max-md:transition-transform max-md:duration-200 max-md:ease-out',
        isOpen
          ? 'max-md:visible max-md:pointer-events-auto max-md:translate-x-0'
          : 'max-md:invisible max-md:pointer-events-none max-md:-translate-x-full',
      )}
    >
      <div className="flex-shrink-0 space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plugins
          </h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            {filteredPlugins.length} / {plugins.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plugin..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 pl-10"
          />
        </div>
      </div>
      {/* `min-h-0` lets this shrink inside the flex column instead of forcing
          the drawer to grow past the viewport. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
        <div className="space-y-2">
          {plugins.map(p => {
            if (!p.icon) {
              throw new Error(`Plugin ${p.name} is missing icon path`);
            }
            const isVisible = p.name
              .toLowerCase()
              .includes(searchQuery.toLowerCase());
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  'pointer-coarse:min-h-11',
                  p.id === plugin?.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted',
                  isVisible ? '' : 'hidden',
                )}
              >
                <img
                  src={`/static/${p.icon}`}
                  alt={p.name}
                  className="w-6 h-6 rounded-sm shrink-0 object-contain"
                  onError={() => {
                    throw new Error(
                      `Icon not found for plugin: ${p.name} at /static/${p.icon}`,
                    );
                  }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function Home() {
  const { plugin } = useAppStore(state => state);

  const [activeTab, setActiveTab] = useState('popular');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen(open => !open), []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  const handleNavigateToParseNovel = useCallback(() => {
    setActiveTab('parse-novel');
  }, []);

  const handleNavigateToParseChapter = useCallback(() => {
    setActiveTab('parse-chapter');
  }, []);

  return (
    // `h-dvh` follows the dynamic viewport, so a collapsing mobile URL bar does
    // not cut the content off. It is deliberately NOT paired with
    // `min-h-screen`: `min-height: 100vh` beats `height: 100dvh` while the URL
    // bar is expanded, which would reintroduce the very overflow `dvh` prevents.
    // The `@supports` fallback in index.css covers WebViews without `dvh`.
    // `pb-safe-nav` keeps the shell's bottom edge clear of the iOS home indicator.
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background pb-safe-nav">
      <PluginHeader
        selectedPlugin={plugin}
        onToggleSidebar={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
      />
      {/* `min-h-0` on the scrolling flex child is what stops it from refusing to
          shrink below its content height. */}
      <div className="flex min-h-0 flex-1">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        <PluginSidebar isOpen={isSidebarOpen} onSelect={closeSidebar} />

        {/* Main Content */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pl-safe pr-safe">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 sm:mb-8">
              <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
                Plugin Playground
              </h1>
              <p className="break-anywhere text-muted-foreground">
                Explore and test {plugin?.name || 'plugin'} features
              </p>
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="mb-6 grid w-full grid-cols-5 sm:mb-8">
                <TabsTrigger
                  value="popular"
                  className="pointer-coarse:min-h-11"
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Popular</span>
                </TabsTrigger>
                <TabsTrigger value="search" className="pointer-coarse:min-h-11">
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </TabsTrigger>
                <TabsTrigger
                  value="parse-novel"
                  className="pointer-coarse:min-h-11"
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Parse Novel</span>
                </TabsTrigger>
                <TabsTrigger
                  value="parse-chapter"
                  className="pointer-coarse:min-h-11"
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Parse Chapter</span>
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="pointer-coarse:min-h-11"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="popular" className="space-y-6">
                <PopularNovelsSection
                  onNavigateToParseNovel={handleNavigateToParseNovel}
                />
              </TabsContent>

              <TabsContent value="search" className="space-y-6">
                <SearchNovelsSection
                  onNavigateToParseNovel={handleNavigateToParseNovel}
                />
              </TabsContent>

              <TabsContent value="parse-novel" className="space-y-6">
                <ParseNovelSection
                  onNavigateToParseChapter={handleNavigateToParseChapter}
                />
              </TabsContent>

              <TabsContent value="parse-chapter" className="space-y-6">
                <ParseChapterSection />
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <SettingsSection />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Home;
