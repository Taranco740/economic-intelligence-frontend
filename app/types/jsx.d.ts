import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
