import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as cheerio from 'cheerio'

type Bindings = {
  DEEPSEEK_API_KEY: string
  DOUBAO_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

app.get('/', (c) => {
  return c.text('Content Analysis AI Backend is running!')
})

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

    // 3. AI Analysis
    let keywords: string[] = []
    
    // Mock AI analysis if no key provided, or implement actual call
    if (c.env.DEEPSEEK_API_KEY) {
      try {
        const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${c.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content: "You are a content analyst. Extract 5-8 keywords from the provided text. Return ONLY the keywords separated by commas."
              },
              {
                role: "user",
                content: `Title: ${contentData.title}\nContent: ${contentData.rawText.substring(0, 2000)}`
              }
            ]
          })
        })
        
        const aiData: any = await aiResponse.json()
        if (aiData.choices && aiData.choices.length > 0) {
          const content = aiData.choices[0].message.content
          keywords = content.split(/,|，|、/).map((k: string) => k.trim()).filter((k: string) => k.length > 0)
        }
      } catch (e) {
        console.error('AI API error:', e)
        // Fallback or ignore
        keywords = ['AI Error', 'Analysis Failed']
      }
    } else {
      // Mock keywords for demo if no API key
      keywords = ['Demo', 'Analysis', 'No API Key', 'Test']
    }

    return c.json({
      code: 200,
      message: 'Success',
      data: {
        ...contentData,
        keywords
      }
    })

  } catch (e: any) {
    return c.json({ code: 500, message: e.message, data: null }, 500)
  }
})

export default app
