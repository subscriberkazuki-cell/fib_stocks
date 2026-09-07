import 'server-only';
import { env } from '@/config/env';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import type { AIProvider } from './AIProvider';
import { HeuristicAIProvider } from './HeuristicAIProvider';
import { LlmAIProvider, type LlmVendor } from './LlmAIProvider';

export function getAIProvider(budget: BudgetGuard): AIProvider {
  const build = (vendor: LlmVendor, apiKey: string, model: string): AIProvider => {
    if (!apiKey) {
      // キー未設定でAIプロバイダを選んでいる場合は、黙って落とさずヒューリスティックに退避する。
      // 「AIが無いから何も出ない」より「AI無しの結果が出る」方が営業ツールとして使える。
      return new HeuristicAIProvider();
    }
    return new LlmAIProvider(
      { vendor, apiKey, model, costPerCallUsd: env.aiCostPerBusiness },
      budget
    );
  };

  switch (env.aiProvider) {
    case 'gemini':
      return build('gemini', env.gemini.apiKey, env.gemini.model);
    case 'openai':
      return build('openai', env.openai.apiKey, env.openai.model);
    case 'anthropic':
      return build('anthropic', env.anthropic.apiKey, env.anthropic.model);
    case 'heuristic':
    default:
      return new HeuristicAIProvider();
  }
}
