import { useEffect, useRef } from 'react';

export interface Keys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  shift: boolean;
  space: boolean;
  ctrl: boolean;
  c: boolean;
  v: boolean;
  z: boolean;
  r: boolean;
}

export function useInput() {
  const keys = useRef<Keys>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    shift: false,
    space: false,
    ctrl: false,
    c: false,
    v: false,
    z: false,
    r: false,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': keys.current.forward = true; break;
        case 'KeyS': keys.current.backward = true; break;
        case 'KeyA': keys.current.left = true; break;
        case 'KeyD': keys.current.right = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.current.shift = true; break;
        case 'Space': keys.current.space = true; e.preventDefault(); break;
        case 'ControlLeft':
        case 'ControlRight': keys.current.ctrl = true; e.preventDefault(); break;
        case 'KeyC': keys.current.c = true; break;
        case 'KeyV': keys.current.v = true; break;
        case 'KeyZ': keys.current.z = true; break;
        case 'KeyR': keys.current.r = true; break;
      }
    };

    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': keys.current.forward = false; break;
        case 'KeyS': keys.current.backward = false; break;
        case 'KeyA': keys.current.left = false; break;
        case 'KeyD': keys.current.right = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.current.shift = false; break;
        case 'Space': keys.current.space = false; break;
        case 'ControlLeft':
        case 'ControlRight': keys.current.ctrl = false; break;
        case 'KeyC': keys.current.c = false; break;
        case 'KeyV': keys.current.v = false; break;
        case 'KeyZ': keys.current.z = false; break;
        case 'KeyR': keys.current.r = false; break;
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return keys;
}
