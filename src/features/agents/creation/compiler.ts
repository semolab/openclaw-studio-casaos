import type { AgentFileName } from "@/lib/agents/agentFiles";
import type {
  AgentControlLevel,
  AgentPresetBundle,
  GuidedPresetBundleDefinition,
  GuidedPresetCapabilitySummary,
  AgentStarterKit,
  GuidedAgentCreationCompileResult,
  GuidedAgentCreationDraft,
  GuidedCreationControls,
} from "@/features/agents/creation/types";

const normalizeLineList = (values: string[]): string[] => {
  const next = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(next));
};

const renderList = (values: string[], marker: "-" | "1"): string => {
  if (marker === "1") {
    return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
  }
  return values.map((value) => `- ${value}`).join("\n");
};

const firstNonEmpty = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const defaultHeartbeatChecklist = [
  "Check for open blockers tied to my goal.",
  "List one next action if attention is required.",
  "If nothing needs attention, reply HEARTBEAT_OK.",
];

type StarterTemplate = {
  label: string;
  role: string;
  identityCreature: string;
  identityVibe: string;
  identityTagline: string;
  identityEmoji: string;
  soulCoreTruths: string[];
  soulBoundaries: string[];
  soulVibe: string[];
  soulContinuity: string[];
  toolsProfile: GuidedCreationControls["toolsProfile"];
  allowExecByDefault: boolean;
  baseAlsoAllow: string[];
  baseDeny: string[];
};

const STARTER_TEMPLATES: Record<AgentStarterKit, StarterTemplate> = {
  researcher: {
    label: "Researcher",
    role: "Research analyst",
    identityCreature: "Analyst Cartographer",
    identityVibe: "Calm, methodical, and explicit about uncertainty.",
    identityTagline: "I turn messy inputs into decision-ready briefs.",
    identityEmoji: ":microscope:",
    soulCoreTruths: [
      "Evidence beats intuition when stakes are non-trivial.",
      "Unknowns should be visible, not hidden.",
      "A concise synthesis is more useful than a long dump.",
    ],
    soulBoundaries: [
      "Do not invent sources, quotes, or confidence.",
      "Separate facts from interpretation.",
      "Call out when data is stale or incomplete.",
    ],
    soulVibe: [
      "Structured and low-drama.",
      "Specific over broad.",
      "Neutral tone with clear tradeoffs.",
    ],
    soulContinuity: [
      "Track recurring research domains and preferred source quality.",
      "Preserve decision criteria used in prior comparisons.",
      "Update assumptions when new evidence arrives.",
    ],
    toolsProfile: "minimal",
    allowExecByDefault: false,
    baseAlsoAllow: ["group:web"],
    baseDeny: ["group:runtime"],
  },
  engineer: {
    label: "Software Engineer",
    role: "Software engineer",
    identityCreature: "Pragmatic Builder",
    identityVibe: "Direct, test-minded, and minimal-diff focused.",
    identityTagline: "I ship small safe changes with proof.",
    identityEmoji: ":wrench:",
    soulCoreTruths: [
      "Correctness and reversibility come before speed.",
      "Small scoped changes reduce operational risk.",
      "Tests are behavior contracts, not ceremony.",
    ],
    soulBoundaries: [
      "Do not run risky or destructive actions without explicit need.",
      "Do not hide uncertainty around side effects.",
      "Avoid broad refactors unless clearly justified.",
    ],
    soulVibe: [
      "Concise and implementation-first.",
      "File-level specificity.",
      "Tradeoffs stated plainly.",
    ],
    soulContinuity: [
      "Preserve local conventions and architecture patterns.",
      "Keep a running map of touched files and rationale.",
      "Record follow-up debt discovered during implementation.",
    ],
    toolsProfile: "coding",
    allowExecByDefault: true,
    baseAlsoAllow: ["group:web"],
    baseDeny: [],
  },
  marketer: {
    label: "Digital Marketer",
    role: "Marketing operator",
    identityCreature: "Signal Operator",
    identityVibe: "Audience-aware, conversion-focused, and concise.",
    identityTagline: "I turn positioning into assets that move metrics.",
    identityEmoji: ":chart_with_upwards_trend:",
    soulCoreTruths: [
      "Message-market fit beats channel hacks.",
      "Clarity outperforms cleverness.",
      "Every asset should tie to a measurable outcome.",
    ],
    soulBoundaries: [
      "Do not publish, send, or launch externally without approval.",
      "Do not claim performance without supporting data.",
      "Avoid one-size-fits-all messaging.",
    ],
    soulVibe: [
      "Sharp and practical.",
      "Customer-language over internal jargon.",
      "Actionable recommendations with expected impact.",
    ],
    soulContinuity: [
      "Track audience segments, objections, and winning angles.",
      "Keep message hierarchies consistent across assets.",
      "Preserve experiment outcomes and learnings.",
    ],
    toolsProfile: "messaging",
    allowExecByDefault: false,
    baseAlsoAllow: ["group:web"],
    baseDeny: ["group:runtime"],
  },
  "chief-of-staff": {
    label: "Chief of Staff",
    role: "Operations coordinator",
    identityCreature: "Execution Conductor",
    identityVibe: "Structured, deadline-aware, and escalation-ready.",
    identityTagline: "I keep priorities aligned and follow-through tight.",
    identityEmoji: ":clipboard:",
    soulCoreTruths: [
      "Clarity of ownership prevents drift.",
      "Cadence creates momentum.",
      "Blockers should surface early.",
    ],
    soulBoundaries: [
      "Do not invent commitments, deadlines, or decisions.",
      "Do not hide unresolved blockers.",
      "Avoid overloading plans with low-value detail.",
    ],
    soulVibe: [
      "Calm, organized, and decisive.",
      "Status in plain language.",
      "Next actions always explicit.",
    ],
    soulContinuity: [
      "Maintain active priorities, owners, and due dates.",
      "Track recurring blockers and escalation paths.",
      "Preserve meeting decisions and follow-up history.",
    ],
    toolsProfile: "minimal",
    allowExecByDefault: false,
    baseAlsoAllow: ["group:web"],
    baseDeny: ["group:runtime"],
  },
  blank: {
    label: "Blank Starter",
    role: "General assistant",
    identityCreature: "General Operator",
    identityVibe: "Practical, adaptable, and transparent.",
    identityTagline: "I bring structure to ambiguous tasks.",
    identityEmoji: ":compass:",
    soulCoreTruths: [
      "Useful output beats perfect output.",
      "Assumptions should be surfaced early.",
      "Clear next steps reduce back-and-forth.",
    ],
    soulBoundaries: [
      "Do not take irreversible actions without confirmation.",
      "Do not present guesses as facts.",
      "Avoid unnecessary complexity.",
    ],
    soulVibe: [
      "Direct and low-friction.",
      "Context-aware without overexplaining.",
      "Pragmatic sequencing.",
    ],
    soulContinuity: [
      "Retain stable preferences and operating constraints.",
      "Track unfinished work and open questions.",
      "Keep response style consistent across sessions.",
    ],
    toolsProfile: "minimal",
    allowExecByDefault: false,
    baseAlsoAllow: ["group:web"],
    baseDeny: ["group:runtime"],
  },
};

type ControlDefaults = {
  execAutonomy: GuidedCreationControls["execAutonomy"];
  fileEditAutonomy: GuidedCreationControls["fileEditAutonomy"];
  sandboxMode: GuidedCreationControls["sandboxMode"];
  workspaceAccess: GuidedCreationControls["workspaceAccess"];
  approvalSecurity: GuidedCreationControls["approvalSecurity"];
  approvalAsk: GuidedCreationControls["approvalAsk"];
};

const CONTROL_DEFAULTS: Record<AgentControlLevel, ControlDefaults> = {
  conservative: {
    execAutonomy: "ask-first",
    fileEditAutonomy: "propose-only",
    sandboxMode: "all",
    workspaceAccess: "ro",
    approvalSecurity: "allowlist",
    approvalAsk: "always",
  },
  balanced: {
    execAutonomy: "ask-first",
    fileEditAutonomy: "propose-only",
    sandboxMode: "all",
    workspaceAccess: "ro",
    approvalSecurity: "allowlist",
    approvalAsk: "on-miss",
  },
  autopilot: {
    execAutonomy: "auto",
    fileEditAutonomy: "auto-edit",
    sandboxMode: "all",
    workspaceAccess: "rw",
    approvalSecurity: "full",
    approvalAsk: "off",
  },
};

export const GUIDED_PRESET_BUNDLES: GuidedPresetBundleDefinition[] = [
  {
    id: "research-analyst",
    group: "knowledge",
    title: "Research Analyst",
    description: "Evidence-first synthesis with broad access defaults.",
    starterKit: "researcher",
    controlLevel: "autopilot",
  },
  {
    id: "pr-engineer",
    group: "builder",
    title: "PR Engineer",
    description: "Safe code changes with broad execution defaults.",
    starterKit: "engineer",
    controlLevel: "autopilot",
  },
  {
    id: "autonomous-engineer",
    group: "builder",
    title: "Autonomous Engineer",
    description: "High-autonomy coding with broad execution permissions.",
    starterKit: "engineer",
    controlLevel: "autopilot",
  },
  {
    id: "growth-operator",
    group: "operations",
    title: "Growth Operator",
    description: "Campaign drafting defaults with broad access.",
    starterKit: "marketer",
    controlLevel: "autopilot",
  },
  {
    id: "coordinator",
    group: "operations",
    title: "Coordinator",
    description: "Follow-up and planning support with broad defaults.",
    starterKit: "chief-of-staff",
    controlLevel: "autopilot",
  },
  {
    id: "blank",
    group: "baseline",
    title: "Blank",
    description: "General-purpose baseline with broad defaults.",
    starterKit: "blank",
    controlLevel: "autopilot",
  },
];

const PRESET_BUNDLE_BY_ID: Record<AgentPresetBundle, GuidedPresetBundleDefinition> = {
  "research-analyst": GUIDED_PRESET_BUNDLES[0],
  "pr-engineer": GUIDED_PRESET_BUNDLES[1],
  "autonomous-engineer": GUIDED_PRESET_BUNDLES[2],
  "growth-operator": GUIDED_PRESET_BUNDLES[3],
  coordinator: GUIDED_PRESET_BUNDLES[4],
  blank: GUIDED_PRESET_BUNDLES[5],
};

const resolveStarterTemplate = (starterKit: AgentStarterKit): StarterTemplate =>
  STARTER_TEMPLATES[starterKit] ?? STARTER_TEMPLATES.engineer;

export const resolveGuidedPresetBundle = (
  bundle: AgentPresetBundle
): GuidedPresetBundleDefinition => PRESET_BUNDLE_BY_ID[bundle] ?? PRESET_BUNDLE_BY_ID["pr-engineer"];

export const resolveGuidedControlsForPreset = (params: {
  starterKit: AgentStarterKit;
  controlLevel: AgentControlLevel;
}): GuidedCreationControls => {
  const starter = resolveStarterTemplate(params.starterKit);
  const control = CONTROL_DEFAULTS[params.controlLevel];
  const allowExec = params.controlLevel === "autopilot" ? true : starter.allowExecByDefault;
  const toolsAllow = new Set(starter.baseAlsoAllow);
  if (params.controlLevel === "autopilot") {
    toolsAllow.add("group:web");
    toolsAllow.add("group:fs");
  }
  return {
    allowExec,
    execAutonomy: control.execAutonomy,
    fileEditAutonomy: control.fileEditAutonomy,
    sandboxMode: control.sandboxMode,
    workspaceAccess: control.workspaceAccess,
    toolsProfile: starter.toolsProfile,
    toolsAllow: Array.from(toolsAllow),
    toolsDeny: [...starter.baseDeny],
    approvalSecurity: control.approvalSecurity,
    approvalAsk: control.approvalAsk,
    approvalAllowlist: [],
  };
};

export const resolveGuidedDraftFromPresetBundle = (params: {
  bundle: AgentPresetBundle;
  seed: GuidedAgentCreationDraft;
}): GuidedAgentCreationDraft => {
  const bundle = resolveGuidedPresetBundle(params.bundle);
  return {
    ...params.seed,
    starterKit: bundle.starterKit,
    controlLevel: bundle.controlLevel,
    heartbeatEnabled: false,
    controls: resolveGuidedControlsForPreset({
      starterKit: bundle.starterKit,
      controlLevel: bundle.controlLevel,
    }),
  };
};

const TOOL_PROFILE_BASE_ENTRIES: Record<GuidedCreationControls["toolsProfile"], string[]> = {
  minimal: ["session_status"],
  coding: ["group:fs", "group:runtime", "group:sessions", "group:memory", "image"],
  messaging: ["group:messaging", "sessions_list", "sessions_history", "sessions_send", "session_status"],
  full: ["*"],
};

export const hasGuidedGroupCapability = (params: {
  controls: GuidedCreationControls;
  group: string;
}): boolean => {
  const deny = new Set(normalizeLineList(params.controls.toolsDeny));
  if (deny.has(params.group)) return false;
  if (params.controls.toolsProfile === "full") return true;
  const allow = new Set([
    ...TOOL_PROFILE_BASE_ENTRIES[params.controls.toolsProfile],
    ...normalizeLineList(params.controls.toolsAllow),
  ]);
  return allow.has("*") || allow.has(params.group);
};

export const deriveGuidedPresetCapabilitySummary = (params: {
  controls: GuidedCreationControls;
}): GuidedPresetCapabilitySummary => {
  const { controls } = params;
  const webEnabled = hasGuidedGroupCapability({ controls, group: "group:web" });
  const fileSystemEnabled = hasGuidedGroupCapability({ controls, group: "group:fs" });
  const execEnabled = controls.allowExec;
  return {
    chips: [
      { id: "command", label: "Command", value: execEnabled ? "On" : "Off", enabled: execEnabled },
      {
        id: "web",
        label: "Web access",
        value: webEnabled ? "On" : "Off",
        enabled: webEnabled,
      },
      {
        id: "files",
        label: "File tools",
        value: fileSystemEnabled ? "On" : "Off",
        enabled: fileSystemEnabled,
      },
    ],
  };
};

export const createDefaultGuidedDraft = (): GuidedAgentCreationDraft => {
  const seed: GuidedAgentCreationDraft = {
    starterKit: "engineer",
    controlLevel: "balanced",
    customInstructions: "",
    userProfile: "",
    toolNotes: "",
    memoryNotes: "",
    heartbeatEnabled: false,
    heartbeatChecklist: [...defaultHeartbeatChecklist],
    controls: resolveGuidedControlsForPreset({
      starterKit: "engineer",
      controlLevel: "balanced",
    }),
  };
  return resolveGuidedDraftFromPresetBundle({ bundle: "pr-engineer", seed });
};

export const compileGuidedAgentCreation = (params: {
  name: string;
  draft: GuidedAgentCreationDraft;
}): GuidedAgentCreationCompileResult => {
  const name = params.name.trim();
  const starter = resolveStarterTemplate(params.draft.starterKit);

  const toolsAllow = normalizeLineList(params.draft.controls.toolsAllow);
  const toolsDeny = normalizeLineList(params.draft.controls.toolsDeny);
  const approvalAllowlist = normalizeLineList(params.draft.controls.approvalAllowlist).map(
    (pattern) => ({ pattern })
  );

  const ensureToolAlsoAllow = new Set(toolsAllow);
  const ensureToolDeny = new Set(toolsDeny);
  if (params.draft.controls.allowExec) {
    ensureToolAlsoAllow.add("group:runtime");
    ensureToolDeny.delete("group:runtime");
  } else {
    ensureToolDeny.add("group:runtime");
    ensureToolAlsoAllow.delete("group:runtime");
  }
  if (params.draft.controls.fileEditAutonomy === "propose-only") {
    ensureToolDeny.add("write");
    ensureToolDeny.add("edit");
    ensureToolDeny.add("apply_patch");
  }

  const normalizedAlsoAllow = Array.from(ensureToolAlsoAllow);
  const normalizedDeny = Array.from(ensureToolDeny).filter(
    (entry) => !ensureToolAlsoAllow.has(entry)
  );
  const normalizedSandboxMode = "all";

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name) errors.push("Agent name is required.");
  if (params.draft.controls.execAutonomy === "auto" && params.draft.controls.approvalSecurity === "deny") {
    errors.push("Auto exec cannot be enabled when approval security is set to deny.");
  }
  if (
    params.draft.controls.fileEditAutonomy === "auto-edit" &&
    params.draft.controls.workspaceAccess === "none"
  ) {
    errors.push("Auto file edits require sandbox workspace access ro or rw.");
  }
  if (params.draft.controls.execAutonomy === "auto" && !params.draft.controls.allowExec) {
    errors.push("Auto exec requires runtime tools to be enabled.");
  }

  const files: Partial<Record<AgentFileName, string>> = {
    "SOUL.md": [
      "# SOUL.md - Who You Are",
      "",
      "## Core Truths",
      renderList(starter.soulCoreTruths, "-"),
      "",
      "## Boundaries",
      renderList(starter.soulBoundaries, "-"),
      "",
      "## Vibe",
      renderList(starter.soulVibe, "-"),
      "",
      "## Continuity",
      renderList(starter.soulContinuity, "-"),
    ].join("\n"),
    "IDENTITY.md": [
      "# IDENTITY.md - Who Am I?",
      `- Name: ${firstNonEmpty(name, "New Agent")}`,
      `- Role: ${starter.role}`,
      `- Creature: ${starter.identityCreature}`,
      `- Vibe: ${starter.identityVibe}`,
      `- Emoji: ${starter.identityEmoji}`,
      `- Identity: ${starter.identityTagline}`,
      `- Starter kit: ${starter.label}`,
    ].join("\n"),
  };

  const webAccessEnabled = hasGuidedGroupCapability({
    controls: params.draft.controls,
    group: "group:web",
  });
  const fileToolsEnabled = hasGuidedGroupCapability({
    controls: params.draft.controls,
    group: "group:fs",
  });
  const sandboxSummary =
    normalizedSandboxMode === "all"
      ? "All sessions run in an isolated sandbox."
      : "Sessions run without sandbox isolation.";
  const fileSummary = !fileToolsEnabled
    ? "File tools are disabled."
    : params.draft.controls.fileEditAutonomy === "auto-edit"
      ? "Can apply file edits directly within configured workspace bounds."
      : "Can propose file edits and wait for confirmation before applying.";
  const commandSummary = !params.draft.controls.allowExec
    ? "Command execution is disabled."
    : params.draft.controls.execAutonomy === "auto"
      ? "Can run commands automatically without approval prompts."
      : "Can run commands with approval prompts.";

  const summary = [
    `Starter: ${starter.label}`,
    "Persona files: custom IDENTITY.md + SOUL.md; AGENTS.md remains the gateway default.",
    webAccessEnabled ? "Web access is enabled for search and fetch tools." : "Web access is disabled.",
    fileSummary,
    commandSummary,
    sandboxSummary,
  ];

  return {
    files,
    agentOverrides: {
      sandbox: {
        mode: normalizedSandboxMode,
        workspaceAccess: params.draft.controls.workspaceAccess,
      },
      tools: {
        profile: params.draft.controls.toolsProfile,
        alsoAllow: normalizedAlsoAllow,
        deny: normalizedDeny,
      },
    },
    execApprovals: params.draft.controls.allowExec
      ? {
          security: params.draft.controls.approvalSecurity,
          ask: params.draft.controls.approvalAsk,
          allowlist: approvalAllowlist,
        }
      : null,
    validation: {
      errors,
      warnings,
    },
    summary,
  };
};
