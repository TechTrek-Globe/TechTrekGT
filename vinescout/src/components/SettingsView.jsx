export default function SettingsView() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Web portal preferences.</p>
      </div>

      <div className="vs-card">
        <p className="text-slate-300 mb-4">
          Almost all VScout settings (API keys, syncing preferences, deep scan limits, etc.) are managed directly inside the <strong>VScout Chrome Extension</strong>.
        </p>
        <p className="text-slate-300">
          Future updates to the web portal will add visualization preferences, export tools, and notifications here.
        </p>
      </div>
    </div>
  );
}
