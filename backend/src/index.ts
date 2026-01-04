import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as cheerio from 'cheerio'

type Bindings = {
  DEEPSEEK_API_KEY: string
  OPENAI_API_KEY: string
  GEMINI_API_KEY: string
  QWEN_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

app.get('/', (c) => {
  return c.text('Content Analysis AI Backend is running!')
})

// Helper function for OpenAI compatible APIs
async function analyzeWithOpenAICompatible(
  apiKey: string,
  endpoint: string,
  model: string,
  title: string,
  content: string
) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "You are a content analyst. Analyze the provided text. \n1. Extract 5-8 keywords. \n2. Summarize the content into exactly 3 key points (sentences). \nReturn the result in strictly valid JSON format like this: {\"keywords\": [\"tag1\", \"tag2\"], \"summary\": \"1. Point one\\n2. Point two\\n3. Point three\"}"
          },
          {
            role: "user",
            content: `Title: ${title}\nContent: ${content.substring(0, 3000)}`
          }
        ],
        response_format: { type: 'json_object' }
      })
    })

    const data: any = await response.json()
    if (data.choices && data.choices.length > 0) {
      const contentStr = data.choices[0].message.content
      try {
        return JSON.parse(contentStr)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        return { keywords: [], summary: contentStr }
      }
    }
    return null
  } catch (e) {
    console.error(`Error calling ${model}:`, e)
    return null
  }
}

// Helper function for Gemini API
async function analyzeWithGemini(
  apiKey: string,
  title: string,
  content: string
) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a content analyst. Analyze the provided text. \n1. Extract 5-8 keywords. \n2. Summarize the content into exactly 3 key points (sentences). \nReturn the result in strictly valid JSON format like this: {"keywords": ["tag1", "tag2"], "summary": "1. Point one\\n2. Point two\\n3. Point three"} \n\nTitle: ${title}\nContent: ${content.substring(0, 3000)}`
          }]
        }]
      })
    })

    const data: any = await response.json()
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      const contentStr = data.candidates[0].content.parts[0].text
      // Clean markdown code blocks if present
      const cleanedStr = contentStr.replace(/```json/g, '').replace(/```/g, '').trim()
      try {
        return JSON.parse(cleanedStr)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        return { keywords: [], summary: cleanedStr }
      }
    }
    return null
  } catch (e) {
    console.error('Error calling Gemini:', e)
    return null
  }
}

app.post('/api/analyze', async (c) => {
  try {
    const body = await c.req.json()
    const url = body.url

    if (!url) {
      return c.json({ code: 400, message: 'URL is required', data: null }, 400)
    }

    // 1. Link Validation
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname
      if (!hostname.includes('xiaohongshu.com') && !hostname.includes('weixin.qq.com')) {
        return c.json({ code: 400, message: 'Only Xiaohongshu and WeChat Official Account links are supported', data: null }, 400)
      }
    } catch (e) {
      return c.json({ code: 400, message: 'Invalid URL format', data: null }, 400)
    }

    // 2. Content Crawling
    let contentData = {
      title: '',
      author: 'Unknown',
      readCount: 'N/A',
      commentCount: 'N/A',
      content: '',
      rawText: ''
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`)
      }

      const html = await response.text()
      const $ = cheerio.load(html)

      if (url.includes('xiaohongshu.com')) {
        // Xiaohongshu extraction logic (simplified, often needs SSR data parsing)
        // Note: XHS is hard to scrape without dynamic rendering or API reverse engineering.
        // We will try best effort with meta tags and common selectors.
        contentData.title = $('meta[property="og:title"]').attr('content') || $('title').text() || ''
        contentData.author = $('meta[name="author"]').attr('content') || $('.author-name').text() || 'Unknown'
        // Read/Comment counts are often dynamic, might not be in static HTML
        contentData.rawText = $('div.desc').text() || $('div.content').text() || ''

      } else if (url.includes('weixin.qq.com')) {
        // WeChat extraction logic
        contentData.title = $('meta[property="og:title"]').attr('content') || $('#activity-name').text().trim() || ''
        contentData.author = $('meta[name="author"]').attr('content') || $('#js_name').text().trim() || 'Unknown'
        contentData.rawText = $('#js_content').text().trim() || ''
        // WeChat read stats are loaded dynamically via JS, hard to get via simple fetch
      }

      // Fallback if rawText is empty, use title
      if (!contentData.rawText) {
        contentData.rawText = contentData.title;
      }

    } catch (e: any) {
      console.error('Crawling error:', e)
      return c.json({ code: 500, message: `Failed to crawl content: ${e.message}`, data: null }, 500)
    }

    // 3. AI Analysis - Multi Provider
    const results: Record<string, any> = {}
    const promises: Promise<void>[] = []

    // Helper to run analysis and assign to results
    const runAnalysis = async (providerName: string, task: Promise<any>) => {
      try {
        const res = await task
        if (res) {
          results[providerName] = res
        } else {
          results[providerName] = { error: 'No data returned' }
        }
      } catch (err: any) {
        results[providerName] = { error: err.message }
      }
    }

    // 1. DeepSeek
    if (c.env.DEEPSEEK_API_KEY) {
      promises.push(runAnalysis('DeepSeek', analyzeWithOpenAICompatible(
        c.env.DEEPSEEK_API_KEY,
        'https://api.deepseek.com/v1/chat/completions',
        'deepseek-chat',
        contentData.title,
        contentData.rawText
      )))
    }

    // 2. OpenAI
    if (c.env.OPENAI_API_KEY) {
      promises.push(runAnalysis('OpenAI', analyzeWithOpenAICompatible(
        c.env.OPENAI_API_KEY,
        'https://api.openai.com/v1/chat/completions',
        'gpt-3.5-turbo',
        contentData.title,
        contentData.rawText
      )))
    }

    // 3. Gemini
    if (c.env.GEMINI_API_KEY) {
      promises.push(runAnalysis('Gemini', analyzeWithGemini(
        c.env.GEMINI_API_KEY,
        contentData.title,
        contentData.rawText
      )))
    }

    // 4. Qwen (DashScope)
    // Note: DashScope is OpenAI compatible at specific endpoint
    if (c.env.QWEN_API_KEY) {
      promises.push(runAnalysis('Qwen', analyzeWithOpenAICompatible(
        c.env.QWEN_API_KEY,
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        'qwen-turbo',
        contentData.title,
        contentData.rawText
      )))
    }

    // If no keys configured, add Demo
    if (promises.length === 0) {
      results['Demo'] = {
        keywords: ['Demo', 'No API Key Configured'],
        summary: '1. Please configure API keys in Cloudflare.\n2. Supported: DeepSeek, OpenAI, Gemini, Qwen.\n3. This is a demo result.'
      }
    } else {
      await Promise.all(promises)
    }

    return c.json({
      code: 200,
      message: 'Success',
      data: {
        ...contentData,
        aiResults: results
      }
    })

  } catch (e: any) {
    return c.json({ code: 500, message: e.message, data: null }, 500)
  }
})

export default app
