import type { RuleEmbedder } from "@teamagent/ports";

export const deterministicRuleEmbedder: RuleEmbedder = {
  modelId: "e2e-test-deterministic",
  dim: 384,
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array(384).fill(0);
      const tokens = text.toLowerCase().match(/[a-z0-9_@/-]+/g) ?? [text.toLowerCase()];

      for (const token of tokens) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
          hash = (hash * 31 + token.charCodeAt(i)) & 0xffff;
        }
        vector[hash % vector.length] += 1;
      }

      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
      return norm === 0 ? vector : vector.map((value) => value / norm);
    });
  },
};
