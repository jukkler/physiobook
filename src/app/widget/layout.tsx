export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.svg" alt="Therapiezentrum Ziesemer" className="h-10" />
          <span className="text-sm font-semibold text-gray-700">Therapiezentrum Ziesemer</span>
        </div>
        {children}
      </div>
    </div>
  );
}
