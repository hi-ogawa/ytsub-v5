import { useEffect, useState } from "react";

/**
 * A flag that stays active for `durationMs` after the last `trigger()`. It is
 * read on demand rather than held in state, so triggering never re-renders.
 */
export function useTimedFlag(durationMs: number) {
  const [flag] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      isActive: () => timer !== undefined,
      trigger: () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
        }, durationMs);
      },
      clear: () => {
        clearTimeout(timer);
        timer = undefined;
      },
    };
  });

  useEffect(() => flag.clear, [flag]);

  return flag;
}
