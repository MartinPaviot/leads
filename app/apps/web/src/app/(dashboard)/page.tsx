import Link from "next/link";

export default function UpNextPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Up next</h1>
            <p className="mt-1 text-sm text-[#8b8ba0]">{today}</p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Meetings</h2>
          <p className="mt-2 text-sm text-[#5a5a70]">No meetings today</p>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="mt-2 text-sm text-[#5a5a70]">No tasks due today</p>
        </div>
      </div>

      {/* Persistent chat input at bottom */}
      <div className="border-t border-[#1e1f2a] p-4">
        <Link
          href="/chat"
          className="flex w-full items-center rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2.5 text-sm text-[#5a5a70] hover:border-[#6366f1]"
        >
          Ask LeadSens...
        </Link>
      </div>
    </div>
  );
}
