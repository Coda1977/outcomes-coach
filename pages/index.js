import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const STORAGE_KEY = 'outcomes-coach:messages';
  const nextIdRef = useRef(2);
  const createId = () => {
    const id = `msg-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  };

  const [messages, setMessages] = useState([
    {
      id: 'msg-1',
      role: 'assistant',
      content: "Welcome! I'm here to help you define clear outcomes for your team members.\n\nLet's start simple: **Who are you trying to define outcomes for?** Tell me the role or person's name and what they do."
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(messages);
  const pendingQueueRef = useRef([]);
  const isSendingRef = useRef(false);
  const didLoadRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hydrated = parsed
            .map(message => ({
              id: typeof message.id === 'string' ? message.id : null,
              role: message.role,
              content: message.content
            }))
            .filter(message => message.role && typeof message.content === 'string');

          const withIds = hydrated.map(message => ({
            ...message,
            id: message.id || createId()
          }));

          let maxId = 1;
          withIds.forEach(message => {
            const match = String(message.id).match(/^msg-(\d+)$/);
            if (match) {
              const value = Number(match[1]);
              if (!Number.isNaN(value)) {
                maxId = Math.max(maxId, value);
              }
            }
          });
          nextIdRef.current = Math.max(nextIdRef.current, maxId + 1);
          setMessages(withIds);
        }
      }
    } catch (error) {
      // Ignore storage errors and fall back to the default message.
    } finally {
      didLoadRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!didLoadRef.current || typeof window === 'undefined') return;
    try {
      const payload = messages.map(({ id, role, content }) => ({ id, role, content }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignore persistence errors (storage full, privacy mode, etc).
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const insertMessageAfterId = (targetId, message) => {
    setMessages(prev => {
      const index = prev.findIndex(m => m.id === targetId);
      if (index === -1) {
        const next = [...prev, message];
        messagesRef.current = next;
        return next;
      }
      const next = [...prev];
      next.splice(index + 1, 0, message);
      messagesRef.current = next;
      return next;
    });
  };

  const appendMessage = (message) => {
    setMessages(prev => {
      const next = [...prev, message];
      messagesRef.current = next;
      return next;
    });
  };

  const updateMessageContent = (messageId, content) => {
    setMessages(prev => {
      const next = prev.map(message => (
        message.id === messageId ? { ...message, content } : message
      ));
      messagesRef.current = next;
      return next;
    });
  };

  const processQueue = async () => {
    if (isSendingRef.current) return;
    const nextId = pendingQueueRef.current.shift();
    if (!nextId) return;

    isSendingRef.current = true;
    setIsLoading(true);

    const snapshot = messagesRef.current;
    const targetIndex = snapshot.findIndex(m => m.id === nextId);
    const messagesForRequest = targetIndex === -1 ? snapshot : snapshot.slice(0, targetIndex + 1);
    const assistantId = createId();
    insertMessageAfterId(nextId, {
      id: assistantId,
      role: 'assistant',
      content: '...'
    });

    try {
      const response = await fetch('/api/chat?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          messages: messagesForRequest.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        let errorMessage = 'Something went wrong. Please try again.';
        try {
          const data = await response.json();
          if (data?.error) errorMessage = data.error;
        } catch (error) {
          // Ignore JSON parsing errors.
        }
        updateMessageContent(assistantId, errorMessage);
        return;
      }

      if (!response.body) {
        const data = await response.json();
        if (data.error) {
          updateMessageContent(assistantId, data.error);
        } else {
          updateMessageContent(assistantId, data.message);
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let hasStreamedText = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        parts.forEach(part => {
          const lines = part.split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) return;
            const data = trimmed.replace(/^data:\s*/, '');
            if (!data || data === '[DONE]') return;

            try {
              const payload = JSON.parse(data);
              if (payload.type === 'delta' && typeof payload.text === 'string') {
                if (!hasStreamedText) {
                  assistantText = payload.text;
                  hasStreamedText = true;
                } else {
                  assistantText += payload.text;
                }
                updateMessageContent(assistantId, assistantText);
              }

              if (payload.type === 'error' && typeof payload.message === 'string') {
                updateMessageContent(assistantId, payload.message);
              }
            } catch (error) {
              // Ignore malformed events.
            }
          });
        });
      }

      if (!hasStreamedText) {
        updateMessageContent(assistantId, "I'm having trouble responding. Please try again.");
      }
    } catch (error) {
      updateMessageContent(assistantId, "Something went wrong. Please try again.");
    } finally {
      isSendingRef.current = false;
      if (pendingQueueRef.current.length > 0) {
        processQueue();
      } else {
        setIsLoading(false);
      }
    }
  };

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage = { id: createId(), role: 'user', content: trimmed };
    appendMessage(userMessage);
    setInput('');
    pendingQueueRef.current.push(userMessage.id);
    processQueue();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessage = (text) => {
    return text.split('\n').map((line, i) => {
      let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedLine = formattedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');
      return <p key={i} style={{ marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: formattedLine || '\u00A0' }} />;
    });
  };

  const handleCopy = async (message) => {
    const text = message.content;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(message.id);
      setTimeout(() => {
        setCopiedId(prev => (prev === message.id ? null : prev));
      }, 1500);
    } catch (error) {
      setCopiedId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Outcomes Coach</title>
        <meta name="description" content="Define results, not activities" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{
        minHeight: '100vh',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F5F0E8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Header */}
        <header style={{
          padding: '1.25rem 1.5rem',
          paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
          borderBottom: '1px solid #E5E5E5',
          backgroundColor: '#F5F0E8'
        }}>
          <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: '#1A1A1A',
              margin: 0
            }}>
              Outcomes Coach
            </h1>
            <p style={{
              fontSize: '0.875rem',
              marginTop: '0.25rem',
              color: '#4A4A4A',
              margin: '0.25rem 0 0 0'
            }}>
              Define results, not activities
            </p>
          </div>
        </header>

        {/* Messages */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2rem 1.5rem',
          WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '1.5rem'
                }}
              >
                <div style={{
                  maxWidth: '85%',
                  borderRadius: '1rem',
                  padding: '1rem 1.25rem',
                  backgroundColor: message.role === 'user' ? '#1A1A1A' : '#FFFFFF',
                  color: message.role === 'user' ? '#F5F0E8' : '#1A1A1A',
                  boxShadow: message.role === 'assistant' ? '0 2px 8px rgba(0,0,0,0.04)' : 'none'
                }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '1rem', lineHeight: 1.6, flex: 1 }}>
                      {formatMessage(message.content)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(message)}
                      style={{
                        borderRadius: '9999px',
                        border: '1px solid',
                        borderColor: message.role === 'user' ? 'rgba(245,240,232,0.35)' : 'rgba(26,26,26,0.2)',
                        backgroundColor: 'transparent',
                        color: message.role === 'user' ? '#F5F0E8' : '#1A1A1A',
                        fontSize: '0.75rem',
                        padding: '0.4rem 0.75rem',
                        cursor: 'pointer',
                        opacity: 0.8,
                        whiteSpace: 'nowrap',
                        touchAction: 'manipulation'
                      }}
                    >
                      {copiedId === message.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '1rem',
                  padding: '1rem 1.25rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: '0.5rem',
                          height: '0.5rem',
                          borderRadius: '50%',
                          backgroundColor: '#9CA3AF',
                          animation: 'bounce 1s infinite',
                          animationDelay: `${i * 150}ms`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
        <footer style={{
          padding: '1.25rem 1.5rem',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
          borderTop: '1px solid #E5E5E5',
          backgroundColor: '#F5F0E8'
        }}>
          <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the role or current goals..."
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck
                style={{
                  flex: 1,
                  padding: '1rem 1.25rem',
                  borderRadius: '9999px',
                  backgroundColor: '#FFFFFF',
                  border: 'none',
                  fontSize: '1rem',
                  color: '#1A1A1A',
                  outline: 'none',
                  opacity: 1
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                style={{
                  padding: '1rem 2rem',
                  borderRadius: '9999px',
                  backgroundColor: '#1A1A1A',
                  color: '#F5F0E8',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: !input.trim() ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() ? 0.4 : 1,
                  transition: 'transform 0.2s, opacity 0.2s',
                  touchAction: 'manipulation'
                }}
              >
                Send
              </button>
            </div>
          </div>
        </footer>

        <style jsx global>{`
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
          }
          @keyframes bounce {
            0%, 60%, 100% {
              transform: translateY(0);
            }
            30% {
              transform: translateY(-4px);
            }
          }
        `}</style>
      </div>
    </>
  );
}

