import Link from 'next/link';
import { redirect } from 'next/navigation';

const isStaticExport = process.env.STATIC_EXPORT === '1';

export default function RootPage() {
  if (!isStaticExport) {
    redirect('/agents');
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="text-center space-y-6 px-8">
        <h1 className="text-4xl font-semibold tracking-tight">Rocket Team</h1>
        <p className="text-ink/70 max-w-xl mx-auto">
          通过 agent 推演团队成员对每项任务的协作意见，把任务最终分给真人。
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/agents/"
            className="px-6 py-3 rounded-md bg-coral text-white font-medium hover:opacity-90 transition"
          >
            进入 Agents
          </Link>
          <Link
            href="/org/"
            className="px-6 py-3 rounded-md border border-ink/15 hover:bg-ink/5 transition"
          >
            查看组织
          </Link>
        </div>
      </div>
    </div>
  );
}
