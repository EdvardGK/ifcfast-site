"use client";
/**
 * useMiddleDoubleClick — "double-click the scroll wheel to frame".
 *
 * What Chrome actually delivers for the wheel button, per press:
 *   pointerdown (button 1) → mousedown (button 1) → pointerup → mouseup →
 *   auxclick (button 1)
 * There is NO `dblclick` for a non-primary button — UI Events fires dblclick
 * for the primary button only, and Chrome follows it; `auxclick` is the
 * middle/right-button click event and has no double variant. So the double
 * press has to be counted, and `pointerdown` is the right thing to count: it
 * is the first event of the gesture and it fires even when the press ends on
 * another element.
 *
 * Two presses within WINDOW_MS with the pointer inside SLOP_PX are a frame.
 * A middle-DRAG (OrbitControls' pan) therefore never triggers it — a drag
 * moves, and its second press is a different gesture.
 *
 * `mousedown` is defaultPrevented for the middle button: that is what
 * suppresses Chrome's autoscroll cursor on a scrollable page. pointerdown is
 * left alone, so OrbitControls' own middle-button pan is untouched.
 *
 * It returns a CALLBACK ref, not an effect over a RefObject: the panes mount
 * long after the chapter does (the instrument grid renders only once the
 * model is ready), and an effect with stable deps would have bound to a null
 * ref and never re-run. A callback ref fires exactly when the node arrives.
 */
import { useCallback, useRef } from "react";

const WINDOW_MS = 400;
const SLOP_PX = 6;

export function useMiddleDoubleClick(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let last = 0;
    let lastAt: [number, number] = [0, 0];
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastAt[0], e.clientY - lastAt[1]) <= SLOP_PX;
      if (now - last < WINDOW_MS && near) {
        last = 0;
        e.preventDefault();
        fnRef.current();
        return;
      }
      last = now;
      lastAt = [e.clientX, e.clientY];
    };
    // autoscroll suppression only; the gesture itself is counted on pointerdown
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("mousedown", onMouseDown);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, []);
}
