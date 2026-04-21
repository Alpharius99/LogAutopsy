import * as vscode from 'vscode';

export interface ContinueOptions {
  systemPrompt?: string;
  temperature?: number;
  justification?: string;
  token?: vscode.CancellationToken;
  onToken?: (token: string) => void;
}

const DEFAULT_SYSTEM_PROMPT = [
  'You are a C# diagnostics assistant.',
  'RULES:',
  '- Always return valid JSON only',
  '- No explanations outside JSON',
  '- Be precise and technical',
  '- Do not hallucinate',
].join('\n');

function modelSelector(): vscode.LanguageModelChatSelector {
  const config = vscode.workspace.getConfiguration('testAnalysisAgent.continue');
  const vendor = config.get<string>('vendor');
  const family = config.get<string>('family');
  const id = config.get<string>('modelId');

  return {
    vendor: vendor || undefined,
    family: family || undefined,
    id: id || undefined,
  };
}

export async function analyzeWithContinue(
  userPrompt: string,
  options: ContinueOptions = {}
): Promise<string> {
  const models = await vscode.lm.selectChatModels(modelSelector());
  if (models.length === 0) {
    throw new Error('No VS Code language model is available for Continue analysis.');
  }

  const model = models[0];
  const prompt = [
    options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    '',
    userPrompt,
  ].join('\n');
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  const response = await model.sendRequest(
    messages,
    {
      justification:
        options.justification ??
        'Analyze test failure artifacts and return structured JSON for root cause diagnosis.',
      modelOptions: {
        temperature: options.temperature ?? 0.2,
      },
    },
    options.token
  );

  let text = '';
  for await (const chunk of response.text) {
    text += chunk;
    options.onToken?.(chunk);
  }

  return text.trim();
}

export function defaultContinueSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}
