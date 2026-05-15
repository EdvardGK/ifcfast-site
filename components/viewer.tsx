"use client";

import { useEffect } from "react";

// model-viewer is a Web Component. Importing for side-effects registers
// the custom element. Cast through `any` for the JSX intrinsic.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "rotation-per-second"?: string;
          "shadow-intensity"?: string;
          "exposure"?: string;
          "environment-image"?: string;
          "interaction-prompt"?: string;
          "camera-orbit"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "camera-target"?: string;
          "field-of-view"?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: string;
        },
        HTMLElement
      >;
    }
  }
}

export function ModelViewer({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  useEffect(() => {
    // Lazy-load model-viewer only on the client. Skips the SSR error
    // and keeps the initial JS bundle small.
    import("@google/model-viewer");
  }, []);

  return (
    <div className="relative w-full h-full bg-white">
      {/* @ts-expect-error — model-viewer is a custom element */}
      <model-viewer
        src={src}
        alt={alt}
        camera-controls
        auto-rotate
        rotation-per-second="12deg"
        shadow-intensity="0.8"
        exposure="1.0"
        interaction-prompt="none"
        camera-orbit="45deg 70deg auto"
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          // model-viewer respects --poster-color
          "--poster-color": "transparent",
        } as React.CSSProperties}
      />
    </div>
  );
}
