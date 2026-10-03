import { useEffect, useRef, useState } from 'react';
import { Plugin } from '@/types/plugin';

type UsePluginCustomAssetsReturn = {
  customCSSLoaded: boolean;
  customJSLoaded: boolean;
  customCSSError: boolean;
  customJSError: boolean;
};

/**
 * Vite serves `public/` at the web root, so the assets themselves live at
 * `/static/…` — the same form every other asset reference in `src/` uses
 * (`src/pages/home.tsx`, `src/components/novel-card.tsx`).
 */
const assetUrl = (name: string) => `/static/${name}`;

/**
 * Custom hook to load and manage plugin custom CSS and JS assets
 * @param plugin - The current plugin instance
 * @param chapterText - The loaded chapter text (triggers the JS asset)
 * @returns Object containing loading states for CSS and JS
 */
export function usePluginCustomAssets(
  plugin: Plugin.PluginBase | undefined,
  chapterText: string,
): UsePluginCustomAssetsReturn {
  const [customCSSLoaded, setCustomCSSLoaded] = useState(false);
  const [customJSLoaded, setCustomJSLoaded] = useState(false);
  const [customCSSError, setCustomCSSError] = useState(false);
  const [customJSError, setCustomJSError] = useState(false);
  const customStyleRef = useRef<HTMLStyleElement | null>(null);
  const customScriptRef = useRef<HTMLScriptElement | null>(null);
  const customCSS = plugin?.customCSS;
  const customJS = plugin?.customJS;

  // Styles do not depend on chapter content, so they are injected as soon as
  // the plugin is known and the novel page is styled on its very first paint.
  // `chapterText` is deliberately NOT a dependency here: re-running on every
  // chapter would tear the <style> out and re-append it, flashing the page
  // unstyled each time.
  useEffect(() => {
    // Clean up previous custom styles
    if (customStyleRef.current) {
      customStyleRef.current.remove();
      customStyleRef.current = null;
    }

    setCustomCSSLoaded(false);
    setCustomCSSError(false);

    let cancelled = false;

    if (customCSS) {
      const styleElement = document.createElement('style');
      styleElement.id = 'plugin-custom-css';

      fetch(assetUrl(customCSS))
        .then(response => {
          // Without this a 404 body would be inlined as stylesheet text and
          // still reported as "Applied".
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
        .then(cssContent => {
          // A newer plugin (or an unmount) may have superseded this request
          // while it was in flight; appending now would leave an orphan <style>
          // that the cleanup below can no longer reach.
          if (cancelled) return;
          styleElement.textContent = cssContent;
          document.head.appendChild(styleElement);
          customStyleRef.current = styleElement;
          setCustomCSSLoaded(true);
        })
        .catch(error => {
          if (cancelled) return;
          console.error('Error loading custom CSS:', error);
          setCustomCSSError(true);
        });
    }

    return () => {
      cancelled = true;
      if (customStyleRef.current) {
        customStyleRef.current.remove();
        customStyleRef.current = null;
      }
    };
  }, [customCSS]);

  // The custom script is written against rendered chapter markup, so it still
  // waits for `chapterText` to exist and is re-injected per chapter, as before.
  useEffect(() => {
    if (customScriptRef.current) {
      customScriptRef.current.remove();
      customScriptRef.current = null;
    }

    setCustomJSLoaded(false);
    setCustomJSError(false);

    if (customJS && chapterText) {
      const scriptElement = document.createElement('script');
      scriptElement.id = 'plugin-custom-js';
      scriptElement.src = assetUrl(customJS);

      scriptElement.onload = () => {
        console.log('Custom JS loaded successfully');
        setCustomJSLoaded(true);
      };

      scriptElement.onerror = error => {
        console.error('Error loading custom JS:', error);
        setCustomJSError(true);
      };

      document.head.appendChild(scriptElement);
      customScriptRef.current = scriptElement;
    }

    return () => {
      if (customScriptRef.current) {
        customScriptRef.current.remove();
        customScriptRef.current = null;
      }
    };
  }, [customJS, chapterText]);

  return {
    customCSSLoaded,
    customJSLoaded,
    customCSSError,
    customJSError,
  };
}
