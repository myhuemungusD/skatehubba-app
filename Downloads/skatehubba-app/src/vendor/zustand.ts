import { useEffect, useState } from "react";

export type StateCreator<T> = (
  set: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
  get: () => T,
  api: StoreApi<T>,
) => T;

export interface StoreApi<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
  subscribe: (listener: (state: T, previousState: T) => void) => () => void;
  destroy: () => void;
}

export type UseBoundStore<T> = (<U>(
  selector?: (state: T) => U,
  equalityFn?: (a: U, b: U) => boolean,
) => U) &
  StoreApi<T>;

export function create<T>(createState: StateCreator<T>): UseBoundStore<T> {
  let state: T;
  const listeners = new Set<(state: T, previousState: T) => void>();

  const setState: StoreApi<T>["setState"] = (partial, replace) => {
    const nextState =
      typeof partial === "function"
        ? (partial as (state: T) => Partial<T>)(state)
        : partial;
    const computedState = replace ? (nextState as T) : { ...state, ...nextState };
    if (Object.is(computedState, state)) return;
    const previousState = state;
    state = computedState;
    listeners.forEach((listener) => listener(state, previousState));
  };

  const getState = () => state;

  const subscribe: StoreApi<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const destroy = () => {
    listeners.clear();
  };

  const api: StoreApi<T> = { getState, setState, subscribe, destroy };
  state = createState(setState, getState, api);

  const useStore = <U>(
    selector: (state: T) => U = ((s: T) => s as unknown as U),
    equalityFn: (a: U, b: U) => boolean = Object.is,
  ) => {
    const [selectedState, setSelectedState] = useState(() => selector(state));

    useEffect(() => {
      const callback = (nextState: T) => {
        const selected = selector(nextState);
        setSelectedState((prev) => (equalityFn(prev, selected) ? prev : selected));
      };
      callback(state);
      return subscribe((next) => callback(next));
    }, [selector, equalityFn]);

    return selectedState;
  };

  Object.assign(useStore, api);
  return useStore as UseBoundStore<T>;
}
