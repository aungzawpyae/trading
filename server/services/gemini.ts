export function useGemini() {
  const config = useRuntimeConfig()

  async function analyze(prompt: string): Promise<any> {
    const url = `${config.geminiBaseUrl}/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`

    const response: any = await $fetch(url, {
      method: 'POST',
      body: {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      },
    }).catch((err) => {
      console.error('Gemini API error:', err.message)
      return null
    })

    if (!response) {
      return { signal: 'hold', confidence: 0, summary: 'Gemini API request failed.' }
    }

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

    try {
      return JSON.parse(text)
    } catch {
      console.warn('Gemini returned non-JSON:', text)
      return { signal: 'hold', confidence: 0, summary: text || 'No response.' }
    }
  }

  return { analyze }
}
