"use client";

import { useEffect, useRef, useState } from "react";
import { Instrument, type InstrumentData } from "@/components/instrument";

/**
 * Site-side wrapper for the instrument.
 *
 * The slice describes thousands of products, which is far too much to
 * ship inside the first HTML response of a page people open on a phone.
 * So the JSON is fetched when the section comes into view — long before
 * anyone can tap anything, and never at all for a reader who stops
 * before it.
 */
export function InstrumentSection({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<InstrumentData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false;

    const load = () => {
      fetch(src)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: InstrumentData) => !cancelled && setData(d))
        .catch(() => !cancelled && setFailed(true));
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [src]);

  return (
    <div ref={ref} className="mt-8">
      {data ? (
        <Instrument data={data} initialModel="Architectural" />
      ) : (
        <div className="flex min-h-[18rem] items-center justify-center border border-rule bg-graphite px-6 text-center">
          <p className="cmd text-[0.75rem] text-white/45">
            {failed
              ? "the slice index could not be loaded"
              : "reading the federated slice…"}
          </p>
        </div>
      )}
    </div>
  );
}
