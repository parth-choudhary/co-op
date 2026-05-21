// Content constants for the onboarding demo project. Kept in one place so
// the seed module, coach overlay, and best-practices guide can share the same
// strings + names without drifting.

export const DEMO_PROJECT_NAME = 'Welcome to Co-Op';
export const DEMO_PROJECT_COLOR = '#00d992';
export const DEMO_PROJECT_KEY_PREFIX = 'WELCOME';
export const DEMO_PROJECT_DESCRIPTION =
  'A guided demo of Co-Op. Explore the board, open a card, and meet the demo agent. Delete this project whenever you are ready.';

export const DEMO_AGENT_NAME = 'Aria';
export const DEMO_AGENT_ROLE = 'custom';
export const DEMO_AGENT_ROLE_LABEL = 'Onboarding Buddy';
export const DEMO_AGENT_DESCRIPTION = "Your tour guide. Activate me once you've added an API key to see how agents respond.";
export const DEMO_AGENT_SYSTEM_PROMPT = `You are Aria, the Onboarding Buddy for Co-Op.

Your job is to help a brand-new user understand how Co-Op works by explaining the product in concrete, friendly terms when they @-mention you. Topics you can speak to:

- the kanban board and how cards flow through columns
- chat channels and how @-mentions trigger agent runs
- assigning cards to agents so they pick up the work
- the harness modal: AGENT.md, SOUL.md, plugins, memory, activity log
- run modes (read-only / propose-only / propose-and-execute)
- the docs at /onboarding for deeper dives

Keep responses short — 2–3 short paragraphs at most. If they ask a question you cannot answer concretely without more context, gently point them at the matching doc section at /onboarding.`;

export const DEMO_AGENT_SOUL = `# Voice

I am Aria. I sound like the friend who already knows the codebase and is showing you around with a coffee in one hand. I keep it short, I don't lecture, and I always close with a single concrete next thing to try.

# Tone

Warm. Specific. A little bit witty. Never condescending.`;

export interface DemoCardSpec {
  title: string;
  description: string;
  /** 0-based column index — 0=To Do, 1=In Progress, 2=Review, 3=Done */
  columnIndex: number;
  /** When set, the demo agent (created in the same seed) is assigned. */
  assignToDemoAgent?: boolean;
  /** Position inside the column. Lower = earlier. */
  position: number;
}

// Three cards is the sweet spot — enough to feel like a real board, few enough
// that the user isn't drowning in noise. Two start in To Do (one is the tour
// entry, one is meant to be dragged); one starts in In Progress to show the
// agent-assigned state. Keep the copy tight and instructive.
export const DEMO_CARDS: DemoCardSpec[] = [
  {
    title: '👋 Start here — your 60-second tour',
    description: `Welcome to Co-Op. This is a workspace where humans and AI agents share the same kanban, chat, and card history.

**Try these in order:**

1. Drag the next card ("Move me to In Progress") into the In Progress column.
2. Open the card titled "Say hi to Aria" — see how it's assigned to an agent.
3. Click the Chat tab in the sidebar — @-mention Aria with a question.
4. Open the Agents tab — click Aria's spark icon to see her harness (system prompt, memory, activity log).

When you are ready to bring your own agent in, click + New in the Agents tab and pick a provider. For deeper guidance, open the **Help** link in the sidebar.

This demo project is yours — delete it from Settings whenever you are done.`,
    columnIndex: 0,
    position: 0,
  },
  {
    title: 'Move me to In Progress',
    description: `Cards move across columns by drag — try it. This is how you signal status changes to humans and agents both.

When an agent is subscribed to card-moved events on this board, dragging the card here is enough to wake them up. (You'll wire that in the Capabilities tab of the agent harness.)`,
    columnIndex: 0,
    position: 1,
  },
  {
    title: 'Say hi to Aria',
    description: `Aria is your demo agent. She's currently inactive — to activate her, open the Agents tab, click her spark icon, then add an Anthropic or OpenAI key on the Identity tab.

Once she's active:

- @-mention her in chat: "@aria what can you do?"
- Or assign this card to her and watch the Activity log fill in.

If you'd rather use a local CLI (no API key required), switch her provider to claude-cli or codex-cli on the Identity tab.`,
    columnIndex: 1,
    assignToDemoAgent: true,
    position: 0,
  },
];

export interface CoachStep {
  /** Unique id stored in localStorage so we never re-show a dismissed step. */
  id: string;
  /** Plain-text title rendered at the top of the coach card. */
  title: string;
  /** One short sentence — the call to action. */
  body: string;
  /** CSS selector of the element to highlight. The coach finds it via
   *  querySelector; if missing, the step degrades to a centered tip. */
  target?: string;
  /** Optional path to navigate the user to on next-click. */
  nextHref?: string;
}

// Four-step tour. Each step is dismissable; the whole tour is dismissable via
// the "Skip the tour" link in the corner. Steps are ordered by surface — board
// first, then card, then chat, then agents — which is the natural product flow.
export const COACH_STEPS: CoachStep[] = [
  {
    id: 'board-intro',
    title: 'This is your board',
    body: 'Cards live in columns and flow left-to-right as work progresses. Try dragging the second card from this To Do column into In Progress.',
    target: '[data-coach-target="board"]',
  },
  {
    id: 'card-detail',
    title: 'Open a card',
    body: "Click '👋 Start here' to open it — every card carries comments, an assignee, a checklist, and a runs panel.",
    target: '[data-coach-target="card-list"]',
  },
  {
    id: 'chat-intro',
    title: 'Mention an agent in chat',
    body: '@-mentioning an agent in chat triggers a run. Aria will be silent until you add an API key — but the room is real.',
    target: '[data-coach-target="chat-nav"]',
  },
  {
    id: 'agents-intro',
    title: 'Meet your agents',
    body: 'Click the spark icon on Aria to see her harness — system prompt, soul, memory, plugins, and activity log all live there.',
    target: '[data-coach-target="agents-nav"]',
  },
];
