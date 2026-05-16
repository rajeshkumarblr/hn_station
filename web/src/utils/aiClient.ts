/**
 * Client-side AI service wrapper for Google Gemini, OpenAI, and Local Ollama.
 * This runs entirely in the user's browser, bypassing any server hosting costs.
 */

export interface AISettings {
    provider: 'disabled' | 'gemini' | 'openai' | 'ollama' | 'server-granite';
    apiKey: string;
    model: string;
    ollamaUrl: string;
}

export function getClientAISettings(): AISettings {
    try {
        const provider = (localStorage.getItem('hn_ai_provider') || 'server-granite') as any;
        const apiKey = localStorage.getItem('hn_ai_key') || '';
        const model = localStorage.getItem('hn_ai_model') || '';
        const ollamaUrl = localStorage.getItem('hn_ollama_url') || 'http://localhost:11434';
        return { provider, apiKey, model, ollamaUrl };
    } catch {
        return { provider: 'server-granite', apiKey: '', model: '', ollamaUrl: 'http://localhost:11434' };
    }
}

export function saveClientAISettings(settings: AISettings) {
    try {
        localStorage.setItem('hn_ai_provider', settings.provider);
        localStorage.setItem('hn_ai_key', settings.apiKey);
        localStorage.setItem('hn_ai_model', settings.model);
        localStorage.setItem('hn_ollama_url', settings.ollamaUrl);
    } catch (e) {
        console.error('Failed to save AI settings to localStorage:', e);
    }
}

export function parseGreedyJSON(text: string): { summary: string[]; topics: string[] } {
    try {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const raw = text.substring(startIdx, endIdx + 1);
            const parsed = JSON.parse(raw);
            let summary: string[] = [];
            if (Array.isArray(parsed.summary)) {
                summary = parsed.summary;
            } else if (typeof parsed.summary === 'string') {
                summary = parsed.summary.split('\n').map((s: string) => s.trim()).filter((s: string) => s !== '');
            }
            let topics: string[] = [];
            if (Array.isArray(parsed.topics)) {
                topics = parsed.topics;
            }
            return { summary, topics };
        }
    } catch (e) {
        console.warn('[aiClient] Failed parsing JSON from raw text, falling back to split parsing:', e);
    }

    // Fallback text split parsing
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    const summaryLines = lines.filter(l => l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l));
    return {
        summary: summaryLines.length > 0 ? summaryLines : [text],
        topics: []
    };
}

export async function clientGenerateSummary(
    title: string,
    content: string
): Promise<{ summary: string; topics: string[] }> {
    const { provider, apiKey, model, ollamaUrl } = getClientAISettings();
    if (provider === 'disabled' || (!apiKey && provider !== 'ollama' && provider !== 'server-granite')) {
        throw new Error('AI Provider is not configured or API Key is missing in Settings.');
    }

    // Truncate content slightly to fit within token limits comfortably
    const maxChars = 20000;
    const truncatedContent = content.length > maxChars ? content.substring(0, maxChars) + '... [truncated]' : content;

    const prompt = `Analyze the following Hacker News article and return a high-quality summary and technical topics.
<Title>${title}</Title>
<ArticleContent>${truncatedContent}</ArticleContent>

INSTRUCTIONS:
- You MUST return a valid JSON object.
- Use ONLY these two keys: "summary" and "topics".
- "summary" MUST be an array of exactly 5 short, impactful bullet points. Do NOT include markdown bullet points inside the string values.
- "topics" MUST be an array of up to 3 one-word lowercase technical tags (e.g., ["postgres", "ai", "llm"]).
- Output NOTHING except the JSON.`;

    let responseText = '';

    if (provider === 'gemini') {
        const geminiModel = model || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Gemini API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'openai') {
        const openAIModel = model || 'gpt-4o-mini';
        const url = 'https://api.openai.com/v1/chat/completions';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: openAIModel,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `OpenAI API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'ollama' || provider === 'server-granite') {
        const ollamaModel = provider === 'server-granite' ? 'granite3.1-dense:2b' : (model || 'llama3.2:3b');
        const url = provider === 'server-granite' ? '/api/ai/proxy/api/generate' : `${ollamaUrl}/api/generate`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });

        if (!res.ok) {
            throw new Error(`${provider === 'server-granite' ? 'Server AI' : 'Ollama'} API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.response || '';
    }

    const parsed = parseGreedyJSON(responseText);
    return {
        summary: parsed.summary.map(s => s.replace(/^[-*•\s\d.]+\s*/, '')).join('\n'),
        topics: parsed.topics
    };
}

export async function clientGenerateChatResponse(
    storyContext: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    newMessage: string
): Promise<string> {
    const { provider, apiKey, model, ollamaUrl } = getClientAISettings();
    if (provider === 'disabled' || (!apiKey && provider !== 'ollama' && provider !== 'server-granite')) {
        throw new Error('AI Provider is not configured or API Key is missing in Settings.');
    }

    // Limit previous context characters to avoid context overflow in browser
    const maxContext = 15000;
    const truncatedContext = storyContext.length > maxContext ? storyContext.substring(0, maxContext) + '... [truncated]' : storyContext;

    const systemPrompt = `You are Antigravity, a helpful AI assistant inside the Hacker News Station client application.
Here is the text content of the Hacker News story and comments thread we are discussing:
---
${truncatedContext}
---
Please answer the user's questions based on this context, formatting your responses using rich Markdown.`;

    if (provider === 'gemini') {
        const geminiModel = model || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        
        // Map roles to Gemini's expected format ('user' and 'model')
        const contents = history.map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }]
        }));
        
        // Prepend system prompt as system instruction
        const body = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [...contents, { role: 'user', parts: [{ text: newMessage }] }]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Gemini API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    } else if (provider === 'openai') {
        const openAIModel = model || 'gpt-4o-mini';
        const url = 'https://api.openai.com/v1/chat/completions';
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: h.content })),
            { role: 'user' as const, content: newMessage }
        ];

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: openAIModel,
                messages: messages
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `OpenAI API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content || 'No response generated.';
    } else if (provider === 'ollama' || provider === 'server-granite') {
        const ollamaModel = provider === 'server-granite' ? 'granite3.1-dense:2b' : (model || 'llama3.2:3b');
        const url = provider === 'server-granite' ? '/api/ai/proxy/api/chat' : `${ollamaUrl}/api/chat`;
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
            { role: 'user', content: newMessage }
        ];

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                messages: messages,
                stream: false
            })
        });

        if (!res.ok) {
            throw new Error(`${provider === 'server-granite' ? 'Server AI' : 'Ollama'} API call failed with status: ${res.status}`);
        }

        const data = await res.json();
        return data.message?.content || 'No response generated.';
    }

    throw new Error('Unsupported AI Provider.');
}
