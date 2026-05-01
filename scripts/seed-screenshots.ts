// One-shot seed for screenshot captures.
// Creates a clean demo workspace under a dedicated user; existing data is left
// alone. Idempotent — re-running wipes the demo workspace and rebuilds it.
//
//   npx tsx scripts/seed-screenshots.ts

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';
import { loadAgentTemplate, loadAgentSoul } from '../src/lib/agentTemplates';

const DEMO_EMAIL = 'demo@co-op.dev';
const DEMO_PASSWORD = 'co-op-demo-2026';
const COMPANY_NAME = 'Acme';
const PROJECT_NAME = 'Acme Platform';
const PROJECT_PREFIX = 'ACME';

async function wipeDemo() {
  const u = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!u) return;
  // Cascade from company; demo user has only this company.
  await prisma.company.delete({ where: { id: u.companyId } });
  console.log('[wipe] removed previous demo workspace');
}

async function main() {
  await wipeDemo();

  const company = await prisma.company.create({ data: { name: COMPANY_NAME } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const owner = await prisma.user.create({
    data: {
      companyId: company.id,
      email: DEMO_EMAIL,
      name: 'Aria Chen',
      passwordHash,
      role: 'owner',
    },
  });

  const project = await prisma.project.create({
    data: {
      companyId: company.id,
      name: PROJECT_NAME,
      description: 'Self-service developer platform for the Acme product line',
      about: 'A platform team building the internal Acme developer experience: docs, SDKs, CLI, observability. Cross-functional with eng, design, and product.',
      color: '#00d992',
      cardKeyPrefix: PROJECT_PREFIX,
      members: { create: { userId: owner.id, role: 'owner' } },
    },
  });

  const board = await prisma.board.create({
    data: { projectId: project.id, name: 'Q2 Roadmap' },
  });

  const columns = await Promise.all(
    [
      { name: 'Backlog', position: 0, color: '#8b949e' },
      { name: 'In Progress', position: 1, color: '#00d992' },
      { name: 'Review', position: 2, color: '#818cf8' },
      { name: 'Done', position: 3, color: '#10b981' },
    ].map((c) =>
      prisma.column.create({ data: { boardId: board.id, ...c } }),
    ),
  );

  const [backlog, inProgress, review, done] = columns;

  // Agents — pulled from the real templates so the harness/soul tabs look correct.
  const agentDefs = [
    { role: 'cto',       name: 'Atlas',  roleLabel: 'CTO',       desc: 'Technical architecture & engineering standards' },
    { role: 'pm',        name: 'Mira',   roleLabel: 'PM',        desc: 'Roadmap, prioritization, cross-team coordination' },
    { role: 'developer', name: 'Kit',    roleLabel: 'Developer', desc: 'Implements cards assigned to engineering' },
    { role: 'designer',  name: 'Nova',   roleLabel: 'Designer',  desc: 'UX flows, visual design, design system' },
  ];
  const agents: Record<string, { id: string; name: string; roleLabel: string }> = {};
  for (const def of agentDefs) {
    const sys = loadAgentTemplate(def.role) || `You are the ${def.roleLabel} of the project. ${def.desc}.`;
    const soul = loadAgentSoul(def.role) || '';
    const a = await prisma.aIAgent.create({
      data: {
        companyId: company.id,
        projectId: project.id,
        name: def.name,
        role: def.role,
        roleLabel: def.roleLabel,
        description: def.desc,
        isActive: true,
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-6',
        systemPrompt: sys,
        soulMd: soul,
        temperature: 0.7,
        plugins: ['kanban', 'about'],
        skills: [],
      },
    });
    agents[def.role] = { id: a.id, name: a.name, roleLabel: a.roleLabel };
  }

  // Cards — realistic-looking platform-team work.
  const cards: Array<{
    title: string;
    column: { id: string };
    priority: 'low' | 'medium' | 'high' | 'urgent';
    labels: string[];
    description?: string;
    assigneeAgentRole?: 'cto' | 'pm' | 'developer' | 'designer';
    assigneeUserId?: string;
  }> = [
    // Backlog
    { title: 'Spec out CLI auto-update flow',           column: backlog,   priority: 'medium', labels: ['cli', 'spec'],         assigneeAgentRole: 'pm' },
    { title: 'Investigate flaky integration tests',     column: backlog,   priority: 'high',   labels: ['testing', 'tech-debt'] },
    { title: 'Design empty-state for SDK dashboard',    column: backlog,   priority: 'medium', labels: ['design', 'sdk'],       assigneeAgentRole: 'designer' },
    { title: 'Write migration guide v2 → v3',           column: backlog,   priority: 'low',    labels: ['docs'] },

    // In Progress
    { title: 'Wire OAuth device flow into CLI',         column: inProgress, priority: 'high',   labels: ['cli', 'auth'],        assigneeAgentRole: 'developer',
      description: 'Implement the device-code OAuth flow so users can `acme login` from a TTY without copy-pasting tokens. Backend endpoint exists at `/auth/device`.' },
    { title: 'Postgres pool exhaustion under load',     column: inProgress, priority: 'urgent', labels: ['bug', 'infra'],       assigneeAgentRole: 'cto' },
    { title: 'Refactor agent-runner tool dispatch',     column: inProgress, priority: 'medium', labels: ['refactor'],            assigneeAgentRole: 'developer' },

    // Review
    { title: 'Docs site dark-mode polish',              column: review,    priority: 'low',    labels: ['design', 'docs'],     assigneeAgentRole: 'designer' },
    { title: 'Add cron-style schedules to agent runs',  column: review,    priority: 'medium', labels: ['feature', 'scheduler'], assigneeAgentRole: 'developer' },

    // Done
    { title: 'Ship Q1 metrics dashboard',               column: done,      priority: 'medium', labels: ['feature'] },
    { title: 'Onboard new platform team designer',      column: done,      priority: 'low',    labels: ['team'],                assigneeUserId: owner.id },
    { title: 'Cut v3.0 release candidate',              column: done,      priority: 'high',   labels: ['release'] },
  ];

  let position = 0;
  let cardCounter = 1;
  const created: Array<{ id: string; title: string; key: string }> = [];
  for (const c of cards) {
    const positionInColumn = position++;
    const created_card = await prisma.card.create({
      data: {
        projectId: project.id,
        number: cardCounter,
        columnId: c.column.id,
        title: c.title,
        description: c.description ?? null,
        position: positionInColumn,
        priority: c.priority,
        labels: c.labels,
        assigneeType: c.assigneeAgentRole ? 'agent' : c.assigneeUserId ? 'user' : null,
        assigneeAgentId: c.assigneeAgentRole ? agents[c.assigneeAgentRole].id : null,
        assigneeUserId: c.assigneeUserId ?? null,
      },
    });
    created.push({ id: created_card.id, title: c.title, key: `${PROJECT_PREFIX}-${cardCounter}` });
    cardCounter += 1;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { nextCardNumber: cardCounter },
  });

  // Add a multi-author comment thread on the OAuth card so the card-detail
  // screenshot shows what agent + human collaboration looks like.
  const oauthCard = created.find((c) => c.title.includes('OAuth'))!;
  const c1 = await prisma.comment.create({
    data: {
      cardId: oauthCard.id,
      content: 'Planning to use the standard `urn:ietf:params:oauth:grant-type:device_code` grant. Backend will need a `/auth/device` and `/auth/token` pair — confirm we want `expires_in` to match our usual 90-day refresh window?',
      authorType: 'agent',
      authorId: agents.developer.id,
    },
  });
  await prisma.comment.create({
    data: {
      cardId: oauthCard.id,
      content: 'Yes, 90 days is right. Also please make sure the device-code response carries `verification_uri_complete` so we can render a QR.',
      authorType: 'user',
      authorId: owner.id,
      parentCommentId: c1.id,
    },
  });
  await prisma.comment.create({
    data: {
      cardId: oauthCard.id,
      content: '90 days is fine; flagging that we should reuse the existing JWT signer rather than introducing a new one. Will note this in MEMORY so future flows don\'t fork the auth stack.',
      authorType: 'agent',
      authorId: agents.cto.id,
      parentCommentId: c1.id,
    },
  });

  // Seed a default chat channel for the project so the chat page isn't empty.
  await prisma.chatChannel.create({
    data: {
      projectId: project.id,
      name: 'general',
      kind: 'channel',
      createdById: owner.id,
      members: {
        create: [
          { userId: owner.id },
          { agentId: agents.cto.id },
          { agentId: agents.pm.id },
          { agentId: agents.developer.id },
        ],
      },
    },
  });

  console.log('[seed] created demo workspace');
  console.log(`        project: ${project.id} (${project.name})`);
  console.log(`        login:   ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  console.log(`        cards:   ${created.length}`);
  console.log(`        agents:  ${Object.keys(agents).length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
