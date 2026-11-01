'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Download, Share, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'trisha-pwa-install-dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(DISMISSED_KEY) === 'true') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isSafari = /safari/i.test(window.navigator.userAgent)
      && !/crios|fxios|edgios/i.test(window.navigator.userAgent);
    const iosTimer = isIos && isSafari
      ? window.setTimeout(() => {
        setIosGuide(true);
        setVisible(true);
      }, 0)
      : undefined;

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    setInstallEvent(null);
  }

  if (!visible) return null;

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-[60] border border-slate-300 bg-white p-4 text-slate-800 shadow-xl sm:left-auto sm:max-w-sm" role="dialog" aria-label="Install Trisha POS">
      <button onClick={dismiss} aria-label="Dismiss install prompt" className="absolute right-3 top-3 border border-slate-200 p-1 text-slate-400 shadow-sm hover:bg-slate-100">
        <X size={16} />
      </button>
      <div className="flex gap-3 pr-6">
        <Image src="/logo/logo.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" />
        <div>
          <h2 className="font-bold">Install Trisha POS</h2>
          {iosGuide ? (
            <p className="mt-1 text-sm text-slate-500">
              Tap <Share size={14} className="mx-1 inline-block" /> Share, then choose <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Add POS to your home screen for faster access.</p>
          )}
        </div>
      </div>
      {!iosGuide && (
        <button onClick={() => void install()} className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-blue-600 bg-blue-600 p-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
          <Download size={16} /> Install app
        </button>
      )}
    </aside>
  );
}
