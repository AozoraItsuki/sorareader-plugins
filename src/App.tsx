import React from 'react';
import { Toaster } from '@/components/ui/sonner';
import Home from './pages/home';
import { TooltipProvider } from './components/ui/tooltip';
import { useTheme } from './hooks/useTheme';

function App() {
  useTheme();

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
      <TooltipProvider>
        <Toaster position="bottom-right" />
        <Home />
      </TooltipProvider>
    </div>
  );
}

export default App;
