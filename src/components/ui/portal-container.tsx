import { createContext, useContext } from "react";

/**
 * Context to redirect Radix UI portals inside a Shadow DOM.
 * When set, Portal components render into this container instead of document.body.
 */
const PortalContainerContext = createContext<HTMLElement | undefined>(
  undefined,
);

const PortalContainerProvider = PortalContainerContext.Provider;
export const usePortalContainer = () => useContext(PortalContainerContext);
