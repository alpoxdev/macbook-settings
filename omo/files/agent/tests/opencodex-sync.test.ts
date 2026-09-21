import { expect, test } from "bun:test"
import { buildModels, managementModelId, mergeEnabledModels } from "../extensions/opencodex-sync"

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

test("uses management capabilities and excludes TokenRouter rows", () => {
  const models = buildModels(
    [
      { id: "anthropic/claude-sonnet-5", reasoning_efforts: null },
      { id: "tokenrouter/z-ai/glm-5.3-flash", reasoning_efforts: null },
    ],
    new Map(),
    new Map([
      [
        "anthropic/claude-sonnet-5",
        {
          contextWindow: 200000,
          reasoningEfforts: ["low", "high"],
          inputModalities: ["text", "image"],
        },
      ],
    ]),
  )

  expect(models).toEqual([
    {
      id: "anthropic/claude-sonnet-5",
      contextWindow: 200000,
      maxTokens: 32000,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: null,
        high: "high",
        xhigh: null,
        max: null,
      },
      input: ["text", "image"],
      cost: ZERO_COST,
    },
  ])
})

test("uses Z.ai role compatibility and enables Claude Fable reasoning", () => {
  const models = buildModels(
    [
      { id: "zai/glm-5.3-flash", reasoning_efforts: ["low", "high", "max"] },
      { id: "anthropic/claude-fable-5-1", reasoning_efforts: null },
    ],
    new Map(),
    new Map([
      [
        "zai/glm-5.3-flash",
        {
          contextWindow: 1000000,
          reasoningEfforts: ["low", "high", "max"],
        },
      ],
      [
        "anthropic/claude-fable-5-1",
        {
          contextWindow: 950000,
          reasoningEfforts: null,
        },
      ],
    ]),
  )

  expect(models).toEqual([
    {
      id: "zai/glm-5.3-flash",
      contextWindow: 1000000,
      maxTokens: 32000,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: null,
        high: "high",
        xhigh: null,
        max: "max",
      },
      compat: { supportsDeveloperRole: false },
      input: ["text"],
      cost: ZERO_COST,
    },
    {
      id: "anthropic/claude-fable-5-1",
      contextWindow: 950000,
      maxTokens: 32000,
      reasoning: true,
      input: ["text"],
      cost: ZERO_COST,
    },
  ])
})

test("registers Claude and Codex-login models from managed public IDs", () => {
  const claude = {
    provider: "anthropic",
    id: "claude-fable-5-1",
    namespaced: "anthropic/claude-fable-5-1",
    contextWindow: 950000,
    reasoningEfforts: ["low", "high", "max"],
    inputModalities: ["text", "image"],
  }
  const codex = {
    provider: "openai",
    id: "main/gpt-5.6-sol",
    namespaced: "main/gpt-5.6-sol",
    contextWindow: 922000,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    inputModalities: ["text", "image"],
  }
  const managedModels = new Map(
    [claude, codex].flatMap((model) => {
      const id = managementModelId(model)
      return id ? [[id, model]] : []
    }),
  )

  expect(buildModels(
    [{ id: claude.namespaced }, { id: codex.namespaced }],
    new Map(),
    managedModels,
  )).toEqual([
    {
      id: claude.namespaced,
      contextWindow: 950000,
      maxTokens: 32000,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: null,
        high: "high",
        xhigh: null,
        max: "max",
      },
      input: ["text", "image"],
      cost: ZERO_COST,
    },
    {
      id: codex.namespaced,
      contextWindow: 922000,
      maxTokens: 32000,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      },
      input: ["text", "image"],
      cost: ZERO_COST,
    },
  ])
})

test("omits guessed limits and dash-encodes nested gateway ids", () => {
  const models = buildModels(
    [
      {
        id: "anthropic/claude-sonnet-5",
        reasoning_efforts: [
          { value: "low" },
          { value: "medium", default: true },
          { value: "high" },
          { value: "xhigh" },
          { value: "max" },
        ],
      },
      { id: "command-code/deepseek/deepseek-v4-flash" },
      { id: "command-code/meituan/LongCat-2.0:free" },
    ],
    new Map(),
    new Map([
      ["anthropic/claude-sonnet-5", { reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] }],
      ["command-code/deepseek-deepseek-v4-flash", { contextWindow: 950000 }],
    ]),
  )

  expect(models.map((model) => ({
    id: model.id,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap,
  }))).toEqual([
    {
      id: "anthropic/claude-sonnet-5",
      contextWindow: 128000,
      maxTokens: 16384,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      },
    },
    {
      id: "command-code/deepseek-deepseek-v4-flash",
      contextWindow: 950000,
      maxTokens: 32000,
      reasoning: false,
    },
    {
      id: "command-code/meituan-LongCat-2.0:free",
      contextWindow: 128000,
      maxTokens: 16384,
      reasoning: false,
    },
  ])
})

test("rewrites slash OpenCodex ids and appends new whitelist entries", () => {
  expect(mergeEnabledModels(
    [
      "opencodex/xai/grok-4.6",
      "openai-codex/gpt-5.6-sol",
      "opencodex/command-code/deepseek/deepseek-v4-flash",
    ],
    ["xai/grok-4.6", "anthropic/claude-sonnet-5", "command-code/deepseek-deepseek-v4-flash"],
  )).toEqual([
    "opencodex/xai/grok-4.6",
    "openai-codex/gpt-5.6-sol",
    "opencodex/command-code/deepseek-deepseek-v4-flash",
    "opencodex/anthropic/claude-sonnet-5",
  ])
})
