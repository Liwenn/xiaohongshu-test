import { useState } from 'react';
import { Loader2, Search, Tag, BookOpen, MessageCircle, User } from 'lucide-react';

interface AIResult {
  keywords: string[];
  summary: string;
  error?: string;
}

interface AnalysisResult {
  title: string;
  author: string;
  readCount: string;
  commentCount: string;
  aiResults: Record<string, AIResult>;
}

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');

  const validateUrl = (input: string) => {
    try {
      const urlObj = new URL(input);
      const hostname = urlObj.hostname;
      return hostname.includes('xiaohongshu.com') || hostname.includes('weixin.qq.com');
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateUrl(url)) {
      setError('请输入有效的小红书或微信公众号链接');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab('');

    try {
      const response = await fetch('https://xiaohongshu-test-backend.578642435.workers.dev/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '分析失败');
      }

      setResult(data.data);
      // Set first available provider as active tab
      const providers = Object.keys(data.data.aiResults || {});
      if (providers.length > 0) {
        setActiveTab(providers[0]);
      }
    } catch (err: any) {
      setError(err.message || '请求出错，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">内容分析 AI 助手</h1>
          <p className="mt-2 text-sm text-gray-600">
            支持小红书、微信公众号链接分析
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="url-input" className="sr-only">文章链接</label>
              <input
                id="url-input"
                name="url"
                type="url"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="在此粘贴链接 (https://...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5 text-white" />
              ) : (
                <span className="flex items-center">
                  <Search className="mr-2 h-4 w-4" />
                  开始分析
                </span>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">错误</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg mt-6">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">分析结果</h3>
            </div>
            <div className="px-4 py-5 sm:p-6 space-y-4">
              <div className="flex items-center space-x-2 text-gray-700">
                <User className="h-5 w-5 text-gray-400" />
                <span className="font-medium">作者:</span>
                <span>{result.author}</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700">
                <BookOpen className="h-5 w-5 text-gray-400" />
                <span className="font-medium">阅读量:</span>
                <span>{result.readCount}</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700">
                <MessageCircle className="h-5 w-5 text-gray-400" />
                <span className="font-medium">评论数:</span>
                <span>{result.commentCount}</span>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="mb-4">
                  <div className="sm:hidden">
                    <label htmlFor="tabs" className="sr-only">Select a tab</label>
                    <select
                      id="tabs"
                      name="tabs"
                      className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                      value={activeTab}
                      onChange={(e) => setActiveTab(e.target.value)}
                    >
                      {Object.keys(result.aiResults).map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden sm:block">
                    <div className="border-b border-gray-200">
                      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        {Object.keys(result.aiResults).map((provider) => (
                          <button
                            key={provider}
                            onClick={() => setActiveTab(provider)}
                            className={`${activeTab === provider
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                          >
                            {provider} 分析结果
                          </button>
                        ))}
                      </nav>
                    </div>
                  </div>
                </div>

                {activeTab && result.aiResults[activeTab] && (
                  <div className="space-y-4">
                    {result.aiResults[activeTab].error ? (
                      <div className="rounded-md bg-red-50 p-4">
                        <p className="text-sm text-red-700">分析出错: {result.aiResults[activeTab].error}</p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center space-x-2 text-gray-700 mb-2">
                            <Tag className="h-5 w-5 text-gray-400" />
                            <span className="font-medium">关键词 ({activeTab}):</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.aiResults[activeTab].keywords.map((keyword, index) => (
                              <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>

                        {result.aiResults[activeTab].summary && (
                          <div>
                            <div className="flex items-center space-x-2 text-gray-700 mb-2">
                              <BookOpen className="h-5 w-5 text-gray-400" />
                              <span className="font-medium">文章摘要 ({activeTab}):</span>
                            </div>
                            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md whitespace-pre-line">
                              {result.aiResults[activeTab].summary}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
