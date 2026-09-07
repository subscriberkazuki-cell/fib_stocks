// LlmAIProvider — Gemini / OpenAI / Anthropic を1つの実装でカバーする。
//
// 3社ともリクエスト形式は違うが「プロンプトを送ってテキストを受け取る」点は同じなので、
// 差分を callModel() に閉じ込め、リトライ・JSON検証・null化のロジックは共通にしている。
//
// すべての呼び出しは budget.spend() を通る（§2-1）。

import 'server-only';
import type {
  AIProvider,
  OfficialSiteInput,
  OfficialSiteJudgement,
  SalesAnalysisInput,
  SalesAnalysisPayload,
} from './AIProvider';
import { officialSiteJudgementSchema, salesAnalysisSchema } from './AIProvider';
import { officialSiteJudgementPrompt, salesAnalysisPrompt } from './prompts';
import { parseWithRetry } from './jsonRetry';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';

export type LlmVendor = 'gemini' | 'openai' | 'anthropic';

export interface LlmConfig {
  vendor: LlmVendor;
  apiKey: string;
  model: string;
  costPerCallUsd: number;
}

export class LlmAIProvider implements AIProvider {
  readonly billable = true;

  constructor(
    private readonly config: LlmConfig,
    private readonly budget: BudgetGuard
  ) {}

  get name(): string {
    return this.config.vendor;
  }
  get modelId(): string {
    return `${this.config.vendor}/${this.config.model}`;
  }

  isConfigured(): boolean {
    return this.config.apiKey !== '';
  }

  costPerCall(): number {
    return this.config.costPerCallUsd;
  }

  async judgeOfficialSite(input: OfficialSiteInput): Promise<OfficialSiteJudgement | null> {
    const basePrompt = officialSiteJudgementPrompt(input);
    const result = await parseWithRetry(officialSiteJudgementSchema, (attempt, prevError) =>
      this.callModel(this.withRetryHint(basePrompt, attempt, prevError), 'official_site_judgement')
    );
    return result.value;
  }

  async analyzeSalesOpportunity(input: SalesAnalysisInput): Promise<SalesAnalysisPayload | null> {
    const basePrompt = salesAnalysisPrompt(input);
    const result = await parseWithRetry(salesAnalysisSchema, (attempt, prevError) =>
      this.callModel(this.withRetryHint(basePrompt, attempt, prevError), 'sales_analysis')
    );
    return result.value;
  }

  /** 前回のパース失敗内容をプロンプトに足して、同じ失敗を繰り返させない */
  private withRetryHint(prompt: string, attempt: number, prevError: string | null): string {
    if (attempt === 1 || !prevError) return prompt;
    return `${prompt}\n\n【前回の出力はJSONとして不正でした】\nエラー: ${prevError}\n指定したJSON形式のみを、前後に何も付けずに出力してください。`;
  }

  private async callModel(prompt: string, note: string): Promise<string> {
    return this.budget.spend<string>({
      kind: 'ai',
      provider: this.modelId,
      estimatedCostUsd: this.config.costPerCallUsd,
      note,
      run: async () => {
        const text = await this.dispatch(prompt);
        return { value: text, actualCostUsd: this.config.costPerCallUsd, requestCount: 1, itemCount: 1 };
      },
    });
  }

  private async dispatch(prompt: string): Promise<string> {
    switch (this.config.vendor) {
      case 'gemini':
        return this.callGemini(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      case 'anthropic':
        return this.callAnthropic(prompt);
    }
  }

  private async callGemini(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Gemini: HTTP ${res.status} ${await res.text().catch(() => '')}`);

    const raw: unknown = await res.json();
    const text = (raw as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      .candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('Gemini: レスポンスにテキストが含まれていません');
    return text;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenAI: HTTP ${res.status} ${await res.text().catch(() => '')}`);

    const raw: unknown = await res.json();
    const text = (raw as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('OpenAI: レスポンスにテキストが含まれていません');
    return text;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 2048,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Anthropic: HTTP ${res.status} ${await res.text().catch(() => '')}`);

    const raw: unknown = await res.json();
    const blocks = (raw as { content?: { type?: string; text?: string }[] }).content ?? [];
    const text = blocks.find((b) => b.type === 'text')?.text;
    if (typeof text !== 'string') throw new Error('Anthropic: レスポンスにテキストが含まれていません');
    return text;
  }
}
