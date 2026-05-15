import React, { useState, useEffect, useRef } from "react";

function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    function tick() {
      savedCallback.current?.();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

function useKeyPress(targetKey: string): boolean {
  const [keyPressed, setKeyPressed] = useState(false);

  useEffect(() => {
    const isFormFocused = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return true;
      }
      return target.isContentEditable;
    };
    const downHandler = (e: KeyboardEvent) => {
      if (isFormFocused(e.target)) return;
      if (e.key.toLowerCase() === targetKey.toLowerCase()) {
        setKeyPressed(true);
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      // Mirror the down guard so a future consumer relying on paired
      // down/up semantics (e.g. push-to-talk) sees consistent state when
      // either edge lands inside a form control.
      if (isFormFocused(e.target)) return;
      if (e.key.toLowerCase() === targetKey.toLowerCase()) {
        setKeyPressed(false);
      }
    };
    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [targetKey]);
  return keyPressed;
}

export { useInterval, useKeyPress };
