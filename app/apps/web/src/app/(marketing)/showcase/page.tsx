import type { Metadata } from "next";
import { ProductShowcase } from "../_components/product-showcase";

export const metadata: Metadata = {
  title: "Product showcase — Elevay",
  robots: { index: false, follow: false }, // prototype route — keep it out of search
};

// Standalone prototype of the pinned horizontal-scroll showcase, isolated from
// the live landing so the motion can be evaluated on its own.
export default function ShowcasePage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-[1240px] px-6 pb-6 pt-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#2563DF]">
          How the engine works
        </p>
        <h1 className="mx-auto mt-4 max-w-[820px] text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-gray-900 sm:text-[48px]">
          One engine, from cold list to closed deal
        </h1>
        <p className="mx-auto mt-4 max-w-[560px] text-base text-gray-600">
          Keep scrolling — the product moves past you, left to right.
        </p>
      </section>
      <ProductShowcase />
    </main>
  );
}
