export default function MeetingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#e8e8ed]">Meetings</h1>
        <p className="text-sm text-[#5a5a70]">0 meetings</p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-[#8b8ba0]">No meetings yet</p>
        <p className="mt-1 text-xs text-[#5a5a70]">
          Connect your calendar to automatically capture meetings.
        </p>
      </div>
    </div>
  );
}
