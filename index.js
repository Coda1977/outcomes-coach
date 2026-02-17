import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Welcome! I'm here to help you define clear outcomes for your team members.\n\nLet's start simple: **Who are you trying to define outcomes for?** Tell me the role or person's name and what they do."
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      const data = await response.json();
      
      if (data.error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Something went wrong. Please try again." 
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Something went wrong. Please try again." 
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
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

  return (
    <>
      <Head>
        <title>Outcomes Coach</title>
        <meta name="description" content="Define results, not activities" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F5F0E8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Header */}
        <header style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E5E5E5'
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
          padding: '2rem 1.5rem'
        }}>
          <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
            {messages.map((message, index) => (
              <div
                key={index}
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
                  <div style={{ fontSize: '1rem', lineHeight: 1.6 }}>
                    {formatMessage(message.content)}
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
          borderTop: '1px solid #E5E5E5'
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
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '1rem 1.25rem',
                  borderRadius: '9999px',
                  backgroundColor: '#FFFFFF',
                  border: 'none',
                  fontSize: '1rem',
                  color: '#1A1A1A',
                  outline: 'none',
                  opacity: isLoading ? 0.5 : 1
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                style={{
                  padding: '1rem 2rem',
                  borderRadius: '9999px',
                  backgroundColor: '#1A1A1A',
                  color: '#F5F0E8',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() || isLoading ? 0.4 : 1,
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
              >
                Send
              </button>
            </div>
            <p style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              marginTop: '1rem',
              color: '#4A4A4A'
            }}>
              Based on Marcus Buckingham's outcomes framework
            </p>
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
