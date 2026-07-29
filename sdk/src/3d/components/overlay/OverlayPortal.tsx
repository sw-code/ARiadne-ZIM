import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

type OverlayPortalContextValue = {
  setPortalContent: (content: React.ReactNode) => void;
  clearPortalContent: () => void;
  getPortalContent: () => React.ReactNode;
  subscribe: (listener: () => void) => () => void;
};

const OverlayPortalContext = createContext<OverlayPortalContextValue | null>(null);

export function OverlayPortalProvider({ children }: React.PropsWithChildren) {
  const portalContentRef = useRef<React.ReactNode>(null);
  const listenersRef = useRef(new Set<() => void>());

  const value = useMemo<OverlayPortalContextValue>(
    () => ({
      setPortalContent: (content) => {
        portalContentRef.current = content;
        listenersRef.current.forEach((listener) => listener());
      },
      clearPortalContent: () => {
        portalContentRef.current = null;
        listenersRef.current.forEach((listener) => listener());
      },
      getPortalContent: () => portalContentRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
    }),
    [],
  );

  return <OverlayPortalContext.Provider value={value}>{children}</OverlayPortalContext.Provider>;
}

export function OverlayPortalPlaceholder() {
  const context = useContext(OverlayPortalContext);
  const portalContent = useSyncExternalStore(
    context?.subscribe ?? emptySubscribe,
    context?.getPortalContent ?? getNullPortalContent,
    getNullPortalContent,
  );

  return <>{portalContent}</>;
}

export function useOverlayPortal(content: React.ReactNode) {
  const context = useContext(OverlayPortalContext);

  useEffect(() => {
    if (!context) return;
    context.setPortalContent(content);
    return () => context.clearPortalContent();
  }, [content, context]);
}

function emptySubscribe() {
  return () => {};
}

function getNullPortalContent() {
  return null;
}
