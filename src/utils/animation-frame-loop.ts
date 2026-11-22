export function startAnimationFrameLoop(
  callback: FrameRequestCallback,
): () => void {
  let frame: number;
  const tick = (time: number) => {
    callback(time);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
