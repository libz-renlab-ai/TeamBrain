// Server component wrapper for the agent detail route. Exists so we can run
// generateStaticParams in static-export builds without making the entire
// detail page (which uses client hooks like useState/useEffect) a server
// component. The client component lives in Client.tsx.

import AgentDetailClient from './Client';
import { listAgents } from '@/lib/agents';

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ name: string }>> {
  try {
    const names = await listAgents();
    return names.map((name) => ({ name }));
  } catch {
    return [];
  }
}

export default function AgentDetailPage({ params }: { params: { name: string } }) {
  return <AgentDetailClient params={params} />;
}
