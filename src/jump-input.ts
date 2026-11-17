// Some controller/browser mappings emit both Gamepad and keyboard input.
// Suppress only cross-source duplicates; rapid presses from one source stay distinct.
export function createJumpInput() {
  let lastSource = '', lastTime = -Infinity;
  return (source: 'keyboard' | 'gamepad' | 'touch', time = performance.now()) => {
    if (source !== lastSource && time - lastTime < 120) return false;
    lastSource = source; lastTime = time;
    return true;
  };
}
