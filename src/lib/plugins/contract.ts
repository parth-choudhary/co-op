// Plugin contract — shape borrowed from OpenClaw's packages/plugin-sdk.
// A plugin bundles tools, optional models, optional channels (inbound transports),
// and optional auth flows. The harness iterates plugins to build the tool list per run.

export interface PluginToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  // Capability key required to expose this tool to an agent. Defaults to plugin name.
  requires?: string;
  handler: PluginToolHandler;
}

export interface PluginToolContext {
  agentId: string;
  projectId: string | null;
  runId?: string;
  // Per-run transient state — used by skills to stack context frames.
  frame?: RunFrame;
  // Where to deliver side-effects initiated by this run. Used by schedule_task
  // to capture the originating chat room so the scheduled fire can reply back.
  delivery?: DeliveryTarget;
}

export interface DeliveryTarget {
  matrixRoomId?: string;
  roomId?: string;
  cardId?: string;
  replyToCommentId?: string;
}

export type PluginToolHandler = (
  ctx: PluginToolContext,
  args: Record<string, any>,
) => Promise<{ ok: boolean; data?: any; error?: string }>;

export interface PluginChannelSpec {
  name: string;                       // e.g. "discord"
  inboundWebhookSlug?: string;         // mounts under /api/webhooks/<plugin>/<slug>
  verify?: (req: Request, body: string) => Promise<boolean>;
  onEvent?: (payload: any, ctx: { projectId: string }) => Promise<void>;
}

export interface PluginAuthFlow {
  provider: string;
  secretKeys: string[]; // ProjectSecret keys this plugin expects
}

export interface Plugin {
  name: string;
  version?: string;
  description?: string;
  tools?: PluginToolSpec[];
  channels?: PluginChannelSpec[];
  auth?: PluginAuthFlow[];
}

// RunFrame: scoped context stack for skill invocations.
export interface RunFrame {
  skillSlug?: string;
  promptAppendix?: string;
  grantedCapabilities?: string[];
}
