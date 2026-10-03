import React, { useState, useEffect, useRef } from 'react';
import { CheckedState } from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/useDebounce';
import { FetchMode } from '@/types/types';

const FETCH_MODES = {
  [FetchMode.PROXY]: 'Proxy',
  [FetchMode.NODE_FETCH]: 'Node Fetch',
  [FetchMode.CURL]: 'Curl',
};

const SettingsSection = React.memo(function SettingsSection() {
  const [settings, setSettings] = useState({
    cookies: '',
    fetchMode: FetchMode.PROXY,
    useUserAgent: true as CheckedState,
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved'>('idle');
  const init = useRef(false);
  const lastSaved = useRef<typeof settings | null>(null);
  const debouncedCookies = useDebounce(settings.cookies, 500);

  useEffect(() => {
    fetch('settings')
      .then(res => res.json())
      .then(data => {
        const loaded = {
          cookies: data.cookies || '',
          fetchMode: data.fetchMode ?? FetchMode.PROXY,
          useUserAgent: data.useUserAgent ?? true,
        };
        setSettings(loaded);
        lastSaved.current = loaded;
        init.current = true;
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!init.current || debouncedCookies !== settings.cookies) return;
    const current = { ...settings, cookies: debouncedCookies };

    if (JSON.stringify(lastSaved.current) === JSON.stringify(current)) return;

    setStatus('loading');
    fetch('settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
      .then(() => {
        lastSaved.current = current;
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      })
      .catch(console.error);
  }, [
    debouncedCookies,
    settings.fetchMode,
    settings.useUserAgent,
    settings.cookies,
  ]);

  const update = <K extends keyof typeof settings>(
    k: K,
    v: (typeof settings)[K],
  ) => setSettings(settings => ({ ...settings, [k]: v }));

  return (
    <div className="space-y-6">
      <Card className="relative p-4 sm:p-6">
        {status === 'saved' && (
          <div className="absolute right-[calc(env(safe-area-inset-right,0px)+1rem)] top-[calc(env(safe-area-inset-top,0px)+1rem)] z-10 flex animate-in items-center gap-2 rounded-md bg-green-500/90 px-4 py-2 text-white shadow-lg fade-in slide-in-from-top-2">
            <Check className="w-4 h-4" /> Settings updated
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Settings are automatically saved
            </p>
          </div>
          {status === 'loading' && (
            <div className="text-sm text-muted-foreground">Saving...</div>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Request Configuration">
            <div className="space-y-2">
              <Label className="font-semibold text-foreground">
                Browser User Agent
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={navigator.userAgent}
                  disabled
                  className="min-w-0 flex-1 font-mono text-xs opacity-60"
                  title={navigator.userAgent}
                />
                <div className="flex shrink-0 items-center gap-2 whitespace-nowrap pointer-coarse:min-h-11">
                  <Checkbox
                    id="use-ua"
                    className="pointer-coarse:h-5 pointer-coarse:w-5"
                    checked={settings.useUserAgent}
                    onCheckedChange={v => update('useUserAgent', v)}
                  />
                  <Label
                    htmlFor="use-ua"
                    className="cursor-pointer text-sm text-foreground"
                  >
                    Use
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="cookies"
                className="font-semibold text-foreground"
              >
                Cookies
              </Label>
              <Input
                id="cookies"
                value={settings.cookies}
                onChange={e => update('cookies', e.target.value.trim())}
                placeholder="Enter cookies (optional)..."
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Additional cookies to send with requests (optional)
              </p>
            </div>
          </Section>

          <Section title="Fetch Settings">
            <div className="space-y-2">
              <Label
                htmlFor="fetch-mode"
                className="font-semibold text-foreground"
              >
                Fetch Mode
              </Label>
              <Select
                value={settings.fetchMode.toString()}
                onValueChange={v => update('fetchMode', parseInt(v))}
              >
                <SelectTrigger id="fetch-mode" className="w-full sm:w-fit">
                  <SelectValue>
                    {
                      FETCH_MODES[
                        settings.fetchMode as keyof typeof FETCH_MODES
                      ]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FETCH_MODES).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select the method used to fetch data from sources
              </p>
            </div>
          </Section>
        </div>
      </Card>
    </div>
  );
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-border" />
        <h3 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export default SettingsSection;
