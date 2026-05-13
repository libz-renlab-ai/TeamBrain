// Generates a richer demo dataset for the static landing page.
// Writes 8 agents + 6 tasks + 4 resources + 10 timeline events into private/.
// Run via: bun tools/generate-demo-data.ts

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { TeamMemberProfile, EvidenceRef } from '../src/types';

const PRIVATE = join(process.cwd(), 'private');

function ev(source_id: string, quote: string, speaker?: string): EvidenceRef {
  return {
    source: 'meeting',
    source_id,
    speaker,
    quote,
    extracted_at: new Date().toISOString()
  };
}

const NOW = new Date().toISOString();

function profile(
  name: string,
  dept: TeamMemberProfile['dept'],
  role: string,
  bio: string,
  persona: string,
  capabilities: TeamMemberProfile['capabilities'],
  workload: TeamMemberProfile['workload'],
  energy: TeamMemberProfile['energy']['current'],
  ccDisplayName: string,
  recentTasks: Array<{ desc: string; outcome: 'success' | 'partial' | 'failed' }>,
  strengths: string[],
  weaknesses: string[],
  collabStyle: string,
  mbti?: string
): TeamMemberProfile {
  return {
    name,
    kind: 'human',
    dept,
    role,
    join_date: '2024-03-15',
    tier: 'deep',
    agents: {
      claude_code: {
        vendor: 'Anthropic',
        model_handle: 'claude-code',
        display_name: ccDisplayName,
        quota_period: 'weekly',
        quota_used_cny: 320,
        quota_limit_cny: 1000,
        current_tasks: recentTasks.slice(0, 1).map((t) => ({
          description: t.desc,
          started_at: NOW
        })),
        past_tasks: recentTasks.slice(1).map((t) => ({
          description: t.desc,
          finished_at: NOW,
          outcome: t.outcome
        })),
        strengths_observed: strengths,
        weaknesses_observed: weaknesses,
        collaboration_style: collabStyle,
        tools_enabled: ['code_edit', 'shell', 'web_browse'],
        last_active_at: NOW
      }
    },
    bio,
    persona,
    capabilities,
    workload,
    energy: { current: energy, evidence: [] },
    collab: { pairs_well_with: [], pairs_poorly_with: [] },
    trajectory: {
      learning_focus: ['LLM evaluation harness', 'distributed tracing'],
      stretch_appetite: 'medium',
      evidence: []
    },
    mbti,
    transcript_misspellings: [],
    recent_overrides: [],
    recent_praises: [],
    recent_objections: [],
    _meta: {
      schema_version: 2,
      bootstrapped_at: NOW,
      evolution_count: 3,
      source_files: ['seed/demo.txt'],
      eligible_for_query: true
    }
  };
}

const PROFILES: TeamMemberProfile[] = [
  profile(
    '林墨',
    '老板',
    'CEO',
    '"我不在乎过程，我在乎我们到底做出了什么。"',
    '产品出身的创始人，对 demo 质感极度敏感，每周亲手用一遍主流程，发现卡顿就追到 commit 级。',
    {
      domains: [
        { name: '产品方向', level: 5, evidence: [ev('seed/demo.txt', '亲自定义北极星指标')] },
        { name: '融资与故事', level: 4, evidence: [ev('seed/demo.txt', '主导 Pre-A')] }
      ],
      skills: [
        { name: '产品评审', level: 5, evidence: [ev('seed/demo.txt', '每周 demo')] }
      ]
    },
    {
      active: [{ proj_id: 'mvp-launch', role: 'CEO', evidence: [] }],
      blocked_on: [],
      hard_constraints: [{ kind: 'time', value: '周一全天 demo', evidence: [] }]
    },
    'normal',
    '林墨 的 Claude Code',
    [
      { desc: '梳理本周用户访谈洞察', outcome: 'success' },
      { desc: '准备投资人 deck v3', outcome: 'success' }
    ],
    ['抓产品节奏快', '决策果断'],
    ['偶尔越层 micromanage'],
    'owner 直接给方向，让 agent 拆解执行步骤',
    'ENTJ'
  ),
  profile(
    '宋砚',
    '研发',
    '研发负责人',
    '"实现细节我可以让 agent 写，但架构边界必须我定。"',
    '架构控，TeamBrain 4 通道分层（PreToolUse / UserPromptSubmit / Stop / AttributionBus）的主设计者。喜欢用 ADR 锁决策。',
    {
      domains: [
        { name: 'Claude Code 内核', level: 5, evidence: [ev('seed/demo.txt', '主导 hook 系统')] },
        { name: '事件总线', level: 5, evidence: [] }
      ],
      skills: [
        { name: 'TypeScript', level: 5, evidence: [] },
        { name: '系统设计', level: 5, evidence: [] }
      ]
    },
    {
      active: [
        { proj_id: 'phase-2', role: '架构主导', evidence: [] },
        { proj_id: 'mcp-server', role: 'tech-lead', evidence: [] }
      ],
      blocked_on: [],
      hard_constraints: []
    },
    'low',
    '宋砚 的 Claude Code',
    [
      { desc: 'Phase 2 设计稿 v2 落 ADR-0014', outcome: 'success' },
      { desc: 'MCP server skeleton', outcome: 'partial' }
    ],
    ['架构敏锐', '边界感强'],
    ['沟通密度过高新人会有压力'],
    'owner 先讨论决策，agent 落实 + 写 ADR',
    'INTJ'
  ),
  profile(
    '苏漾',
    '研发',
    '研发工程师',
    '"先红，再绿，再重构。"',
    'TDD 实践者，喜欢小步原子 commit，是 atomic-commits-on-edit 规则的主要倡导者。',
    {
      domains: [{ name: '测试工程', level: 4, evidence: [] }],
      skills: [
        { name: 'Vitest', level: 5, evidence: [] },
        { name: 'TypeScript', level: 4, evidence: [] }
      ]
    },
    {
      active: [{ proj_id: 'judge-harness', role: '主开发', evidence: [] }],
      blocked_on: [],
      hard_constraints: []
    },
    'normal',
    '苏漾 的 Claude Code',
    [
      { desc: '把 judge harness probe 改成 markdown playbook', outcome: 'success' },
      { desc: '修 vitest Windows OOM', outcome: 'success' }
    ],
    ['节奏稳', '原子提交'],
    ['过度纠结命名'],
    'agent 写 prototype，owner 重写到精炼',
    'ISTP'
  ),
  profile(
    '陈观潮',
    '研发',
    '研发工程师',
    '"我宁愿删 50 行也不愿加 50 行。"',
    '减法主义者，PR 大多是 -N +0 的清理 commit。把 deprecated code 砍掉是他的常驻乐趣。',
    {
      domains: [{ name: '代码考古', level: 4, evidence: [] }],
      skills: [{ name: 'refactoring', level: 5, evidence: [] }]
    },
    {
      active: [],
      blocked_on: [
        { by: '宋砚', evidence: [ev('seed/demo.txt', '等架构 review')] }
      ],
      hard_constraints: []
    },
    'high',
    '陈观潮 的 Claude Code',
    [
      { desc: '清理 apps/landing 旧 HTML 残留', outcome: 'success' }
    ],
    ['敢删', '审美干净'],
    ['偶尔删多了'],
    'owner 给目录，agent 列删除清单，owner 确认',
    'INTP'
  ),
  profile(
    '黎萤',
    '产品',
    '产品负责人',
    '"用户访谈里没有原话证据的需求都是我们自己脑补的。"',
    '产品负责人，TeamBrain 用户访谈 skill 体系的主要使用者。每周必跑 office-hours + plan-ceo-review。',
    {
      domains: [
        { name: '用户访谈', level: 5, evidence: [] },
        { name: '产品策略', level: 4, evidence: [] }
      ],
      skills: [{ name: 'Notion / Figma', level: 4, evidence: [] }]
    },
    {
      active: [{ proj_id: 'user-interview-q2', role: '负责人', evidence: [] }],
      blocked_on: [],
      hard_constraints: [{ kind: 'meeting', value: '周四下午用户访谈', evidence: [] }]
    },
    'normal',
    '黎萤 的 Claude Code',
    [
      { desc: '本周 3 次 prospect 访谈 + 合成', outcome: 'success' },
      { desc: 'TeamBrain 商业卖点的访谈话术草稿', outcome: 'partial' }
    ],
    ['抓真实痛点准', 'evidence 意识强'],
    ['想法多收敛慢'],
    '访谈现场录音 → agent 写 call-summary → owner 标 evidence',
    'ENFJ'
  ),
  profile(
    '邵岚',
    '产品',
    '产品经理',
    '"路线图是地图不是合同。"',
    '负责 RocketTeam landing 与 dashboard 信息架构。重视微交互节奏，反对花里胡哨。',
    {
      domains: [
        { name: '信息架构', level: 4, evidence: [] },
        { name: 'landing 转化', level: 4, evidence: [] }
      ],
      skills: [{ name: '原型设计', level: 4, evidence: [] }]
    },
    {
      active: [{ proj_id: 'landing-v2', role: '负责人', evidence: [] }],
      blocked_on: [],
      hard_constraints: []
    },
    'normal',
    '邵岚 的 Claude Code',
    [
      { desc: 'RocketTeam 静态导出版的 landing 框架', outcome: 'partial' }
    ],
    ['克制', '节奏感好'],
    ['对工程实现弹性的理解偶尔偏理想'],
    'agent 出 3 个方案，owner 挑一个 + 注释取舍',
    'INFJ'
  ),
  profile(
    '陆江璃',
    '职能',
    '法务 / 合规',
    '"先看条款再看演示，倒着也行，反正都得看。"',
    '法务出身，关注用户数据上传/存储边界。强烈反对未脱敏的客户原话直接进 LLM context。',
    {
      domains: [{ name: '数据合规', level: 5, evidence: [] }],
      skills: [{ name: '合同审查', level: 4, evidence: [] }]
    },
    {
      active: [{ proj_id: 'data-policy-v1', role: '主审', evidence: [] }],
      blocked_on: [],
      hard_constraints: [{ kind: 'review', value: '客户数据相关 PR 必须等她批', evidence: [] }]
    },
    'low',
    '陆江璃 的 Claude Code',
    [
      { desc: '审 Slack ingest 的数据脱敏规则', outcome: 'success' }
    ],
    ['边界感强', '细致'],
    ['节奏偏慢'],
    'owner 列条款，agent 找代码反例，owner 决定',
    'ISTJ'
  ),
  profile(
    '于聿',
    '运营',
    '增长 / 社区',
    '"留存比拉新便宜十倍。"',
    '负责开发者社区运营。Twitter / 公众号 / GitHub README 都由她维护，反感虚的口号。',
    {
      domains: [{ name: '开发者社区', level: 4, evidence: [] }],
      skills: [{ name: '文案', level: 4, evidence: [] }]
    },
    {
      active: [{ proj_id: 'launch-week', role: '统筹', evidence: [] }],
      blocked_on: [],
      hard_constraints: []
    },
    'normal',
    '于聿 的 Claude Code',
    [
      { desc: '发布周日历 + 推文草稿 8 条', outcome: 'success' }
    ],
    ['节奏快', '语感好'],
    ['对深度技术内容需要陪聊'],
    'owner 提主题，agent 写 5 版变体，owner 改 1 版',
    'ENFP'
  )
];

// Task shape mirrors `Task` in src/types/index.ts: status is the PMA decision
// state machine, decision is `PMADecisionV2 | null`. Demo data uses minimally
// valid shapes so /tasks/ renders without crashing on the client.
interface DemoTask {
  id: string;
  description: string;
  status: 'predicting' | 'predicted' | 'accepted' | 'overridden' | 'completed';
  decision: null | { final_assignee: string; reason: string };
  override_to?: string;
  override_reason?: string;
  importance?: 'low' | 'medium' | 'high' | 'critical';
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

function task(
  id: string,
  description: string,
  status: DemoTask['status'],
  assignee: string | null,
  importance: DemoTask['importance'] = 'medium',
  urgency: DemoTask['urgency'] = 'medium'
): DemoTask {
  return {
    id,
    description,
    status,
    decision: assignee
      ? { final_assignee: assignee, reason: '画像匹配的推荐人选' }
      : null,
    importance,
    urgency,
    created_at: NOW,
    updated_at: NOW
  };
}

const TASKS: DemoTask[] = [
  task('t_001', '把 RocketTeam 静态导出版接到 GitHub Pages，替换 apps/landing 旧 HTML', 'accepted', '邵岚', 'high', 'high'),
  task('t_002', 'Phase-2 hook 系统的 4 通道契约测试补齐', 'accepted', '苏漾', 'high', 'medium'),
  task('t_003', '本周三场 prospect 用户访谈纪要合成成洞察 doc', 'accepted', '黎萤', 'high', 'high'),
  task('t_004', 'Slack ingestion 的客户原话脱敏规则审计', 'predicted', '陆江璃', 'critical', 'medium'),
  task('t_005', '清理 apps/landing/dist 与 docs/backup/phase1 旧产物', 'completed', '陈观潮', 'medium', 'low'),
  task('t_006', '发布周日历定稿 + 8 条推文初稿', 'completed', '于聿', 'high', 'high')
];

import type { TeamResource } from '../src/types';

const RESOURCES: TeamResource[] = [
  {
    id: 'r_design',
    type: 'subscription',
    name: 'TeamBrain 设计系统 (Figma)',
    vendor: 'figma',
    identifier: 'teambrain-design',
    owners: ['邵岚'],
    users_with_access: ['邵岚', '黎萤', '林墨'],
    monthly_cost_cny: 120,
    notes: 'DESIGN.md 同步到这里',
    created_at: NOW,
    updated_at: NOW
  },
  {
    id: 'r_anthropic',
    type: 'api_key',
    name: 'Anthropic API Key (prod)',
    vendor: 'anthropic',
    identifier: 'sk-ant-…[redacted]',
    owners: ['林墨'],
    users_with_access: ['林墨', '宋砚'],
    monthly_cost_cny: 2800,
    notes: '生产环境唯一 key',
    created_at: NOW,
    updated_at: NOW
  },
  {
    id: 'r_slack',
    type: 'subscription',
    name: '#engineering Slack 频道',
    vendor: 'slack',
    identifier: 'teambrain.slack.com/#engineering',
    owners: ['宋砚'],
    users_with_access: ['宋砚', '苏漾', '陈观潮'],
    notes: '研发日常同步频道',
    created_at: NOW,
    updated_at: NOW
  },
  {
    id: 'r_pages',
    type: 'domain',
    name: 'GitHub Pages 部署',
    vendor: 'github',
    identifier: 'liush2yuxjtu.github.io/TeamBrain/',
    owners: ['邵岚'],
    users_with_access: ['邵岚', '宋砚', '林墨'],
    notes: 'landing-deploy.yml 自动部署',
    created_at: NOW,
    updated_at: NOW
  }
];

interface TimelineEvent {
  ts: string;
  kind: string;
  actor: string;
  detail: string;
}

const TIMELINE: TimelineEvent[] = [
  { ts: NOW, kind: 'task.assigned', actor: '林墨', detail: '把 landing 接到 RocketTeam → 邵岚' },
  { ts: NOW, kind: 'task.completed', actor: '陈观潮', detail: '清理 apps/landing/dist 旧产物' },
  { ts: NOW, kind: 'meeting.parsed', actor: '黎萤', detail: '用户访谈 0511 提取出 3 条关键引言' },
  { ts: NOW, kind: 'review.requested', actor: '宋砚', detail: 'ADR-0014 评审请求 → 陆江璃' },
  { ts: NOW, kind: 'agent.evolved', actor: '苏漾', detail: 'Claude Code 学会偏好原子 commit' },
  { ts: NOW, kind: 'block.posted', actor: '陈观潮', detail: '等架构评审完才能继续删除' },
  { ts: NOW, kind: 'task.completed', actor: '于聿', detail: '发布周日历定稿' },
  { ts: NOW, kind: 'meeting.parsed', actor: '黎萤', detail: 'office-hours 0510 决策点 6 条' },
  { ts: NOW, kind: 'override.recorded', actor: '林墨', detail: '把 t_002 优先级从 P1 提到 P0' },
  { ts: NOW, kind: 'agent.evolved', actor: '宋砚', detail: 'Claude Code 学会先看 ADR 再动手' }
];

async function writeJson(path: string, data: unknown): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  for (const p of PROFILES) {
    await writeJson(join(PRIVATE, 'agents', `${p.name}.json`), p);
  }
  for (const t of TASKS) {
    await writeJson(join(PRIVATE, 'tasks', `${t.id}.json`), t);
  }
  for (const r of RESOURCES) {
    await writeJson(join(PRIVATE, 'resources', `${r.id}.json`), r);
  }
  await writeJson(join(PRIVATE, 'timeline.jsonl'), '');
  // timeline.jsonl is line-delimited
  const lines = TIMELINE.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(join(PRIVATE, 'timeline.jsonl'), lines);
  console.log(`✓ ${PROFILES.length} agents, ${TASKS.length} tasks, ${RESOURCES.length} resources, ${TIMELINE.length} timeline events`);
}

main().catch((err) => {
  console.error('generate-demo-data failed:', err);
  process.exit(1);
});
