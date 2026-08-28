'use client';

import { useState, useRef, useEffect } from 'react';

interface FilterResult {
  number: string;
  status: 'on_whatsapp' | 'not_on_whatsapp' | 'invalid' | 'error';
  reason?: string;
}

export default function WhatsAppFilterPage() {
  const [inputText, setInputText] = useState('');
  const [numbers, setNumbers] = useState<string[]>([]);
  const [results, setResults] = useState<FilterResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [stats, setStats] = useState({ onWhatsApp: 0, notOnWhatsApp: 0, invalid: 0 });
  const [filterTab, setFilterTab] = useState<'all' | 'on_whatsapp' | 'not_on_whatsapp'>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [pauseMessage, setPauseMessage] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const parseNumbers = (text: string): string[] => {
    return text
      .split(/[\n,;]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
      setNumbers(parseNumbers(content));
    };
    reader.readAsText(file);
  };

  const startFilter = () => {
    if (numbers.length === 0) {
      const parsed = parseNumbers(inputText);
      if (parsed.length === 0) {
        alert('Please enter phone numbers first');
        return;
      }
      setNumbers(parsed);
    }

    const numsToCheck = numbers.length > 0 ? numbers : parseNumbers(inputText);
    if (numsToCheck.length === 0) return;

    setIsRunning(true);
    setResults([]);
    setQrCode('');
    setStatus('Connecting to WhatsApp...');
    setProgress({ current: 0, total: numsToCheck.length });
    setStats({ onWhatsApp: 0, notOnWhatsApp: 0, invalid: 0 });

    // Connect to SSE endpoint
    const numbersParam = numsToCheck.join(',');
    const es = new EventSource(`/api/whatsapp/filter?numbers=${encodeURIComponent(numbersParam)}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'qr':
          case 'qr_image':
            if (data.url) setQrCode(data.url);
            else setQrCode(data.qr);
            setStatus('Scan the QR code with your WhatsApp app');
            break;

          case 'status':
            setStatus(data.message);
            break;

          case 'progress':
            setProgress({ current: data.current, total: data.total });
            setStats({
              onWhatsApp: data.onWhatsApp,
              notOnWhatsApp: data.notOnWhatsApp,
              invalid: data.invalid,
            });
            setResults(prev => [...prev, {
              number: data.number,
              status: data.status,
              reason: data.reason,
            }]);
            break;

          case 'heartbeat':
            setProgress({ current: data.current, total: data.total });
            setStats({
              onWhatsApp: data.onWhatsApp,
              notOnWhatsApp: data.notOnWhatsApp,
              invalid: data.invalid,
            });
            break;

          case 'batch_pause':
            setProgress({ current: data.current, total: data.total });
            setStats({
              onWhatsApp: data.onWhatsApp,
              notOnWhatsApp: data.notOnWhatsApp,
              invalid: data.invalid,
            });
            setPauseMessage(data.message);
            setIsPaused(true);
            setStatus(`⏸️ ${data.message}`);
            break;

          case 'done':
            setProgress({ current: data.total, total: data.total });
            setStats({
              onWhatsApp: data.onWhatsApp,
              notOnWhatsApp: data.notOnWhatsApp,
              invalid: data.invalid,
            });
            if (data.results) {
              setResults(data.results);
            }
            setStatus(`✅ Done! Found ${data.onWhatsApp} on WhatsApp, ${data.notOnWhatsApp} not on WhatsApp, ${data.invalid} invalid`);
            setIsRunning(false);
            setIsPaused(false);
            es.close();
            eventSourceRef.current = null;
            break;

          case 'error':
            setStatus(`❌ ${data.message}`);
            setIsRunning(false);
            es.close();
            eventSourceRef.current = null;
            break;
        }
      } catch {}
    };

    es.onerror = () => {
      if (isRunning) {
        setStatus('Connection lost. Reconnecting...');
      }
    };
  };

  const resumeFilter = async () => {
    try {
      const res = await fetch('/api/whatsapp/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      if (res.ok) {
        setIsPaused(false);
        setPauseMessage('');
        setStatus('Resuming...');
      } else {
        const data = await res.json();
        setStatus(`❌ ${data.error}`);
      }
    } catch {
      setStatus('❌ Failed to resume');
    }
  };

  const stopFilter = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    try {
      await fetch('/api/whatsapp/filter', { method: 'DELETE' });
    } catch {}
    setIsRunning(false);
    setIsPaused(false);
    setStatus('Stopped by user');
  };

  const exportCSV = () => {
    const filteredResults = filterTab === 'all' ? results :
      results.filter(r => r.status === filterTab);

    const csv = [
      'Number,Status,Reason',
      ...filteredResults.map(r =>
        `"${r.number}","${r.status}","${r.reason || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-filter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = filterTab === 'all' ? results :
    results.filter(r => r.status === filterTab);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <span style={{ fontSize: '2rem' }}>📱</span>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            WhatsApp Number Filter
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Check which phone numbers are registered on WhatsApp
          </p>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
          How it works
        </h3>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.8 }}>
          <li>Paste your phone numbers below (one per line, or comma-separated)</li>
          <li>Click &quot;Start Filter&quot; and scan the QR code with your WhatsApp app</li>
          <li>Each number is checked with a 5-10 second delay to avoid rate limiting</li>
          <li>Filter pauses every 50 numbers for safety — click Resume to continue</li>
          <li>View results in real-time and export to CSV when done</li>
        </ol>
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'rgba(234, 179, 8, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(234, 179, 8, 0.2)',
          fontSize: '0.8rem',
          color: '#eab308',
        }}>
          ⚠️ Keep your WhatsApp connected during the process. The filter pauses every 50 numbers for safety — you must click Resume to continue. Checking thousands of numbers increases ban risk.
        </div>
      </div>

      {/* Input Section */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Phone Numbers
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              📁 Import CSV/TXT
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setNumbers(parseNumbers(e.target.value));
          }}
          placeholder="Enter phone numbers (one per line or comma-separated)&#10;Example:&#10;+1 555 123 4567&#10;+44 7911 123456&#10;233241234567"
          style={{
            width: '100%',
            height: '150px',
            padding: '1rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {numbers.length > 0 ? `📞 ${numbers.length} numbers ready to check` : 'Enter numbers to begin'}
          </span>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isRunning ? (
              <>
                {isPaused && (
                  <button
                    onClick={resumeFilter}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#22c55e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                    }}
                  >
                    ▶ Resume ({progress.current}/{progress.total})
                  </button>
                )}
                <button
                  onClick={stopFilter}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                >
                  ⏹ Stop
                </button>
              </>
            ) : (
              <button
                onClick={startFilter}
                disabled={numbers.length === 0 && !inputText}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: numbers.length > 0 || inputText ? '#22c55e' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: numbers.length > 0 || inputText ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                ▶ Start Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Section */}
      {(qrCode || (isRunning && status.includes('Scan'))) && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            📱 Scan QR Code with WhatsApp
          </h3>
          {qrCode && qrCode.startsWith('data:') ? (
            <img
              src={qrCode}
              alt="WhatsApp QR Code"
              style={{ width: '300px', height: '300px', borderRadius: '12px', border: '2px solid var(--border)' }}
            />
          ) : (
            <div style={{
              padding: '2rem',
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              whiteSpace: 'pre',
              display: 'inline-block',
              lineHeight: 1.2,
            }}>
              {qrCode}
            </div>
          )}
          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Open WhatsApp → Settings → Linked Devices → Link a Device
          </p>
        </div>
      )}

      {/* Status Bar */}
      {status && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          {isRunning && (
            <div style={{
              width: '20px',
              height: '20px',
              border: '3px solid var(--border)',
              borderTop: '3px solid #22c55e',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          )}
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{status}</span>
          {progress.total > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {progress.current} / {progress.total}
            </span>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {progress.total > 0 && (
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '8px',
          height: '8px',
          marginBottom: '1.5rem',
          overflow: 'hidden',
        }}>
          <div style={{
            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
            height: '100%',
            width: `${(progress.current / progress.total) * 100}%`,
            transition: 'width 0.3s ease',
            borderRadius: '8px',
          }} />
        </div>
      )}

      {/* Batch Pause Banner */}
      {isPaused && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.1)',
          border: '2px solid #eab308',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <span style={{ fontSize: '2rem' }}>⏸️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#eab308', marginBottom: '0.25rem' }}>
              Safety Pause — Batch Complete
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {pauseMessage}. Reviewed {progress.current} of {progress.total} numbers.
              Click Resume to continue with the next batch of 50.
            </div>
          </div>
          <button
            onClick={resumeFilter}
            style={{
              padding: '0.75rem 2rem',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
              whiteSpace: 'nowrap',
            }}
          >
            ▶ Resume
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div
            onClick={() => setFilterTab('all')}
            style={{
              background: filterTab === 'all' ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${filterTab === 'all' ? '#6366f1' : 'var(--border)'}`,
              borderRadius: '12px',
              padding: '1.25rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{results.length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Checked</div>
          </div>
          <div
            onClick={() => setFilterTab('on_whatsapp')}
            style={{
              background: filterTab === 'on_whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${filterTab === 'on_whatsapp' ? '#22c55e' : 'var(--border)'}`,
              borderRadius: '12px',
              padding: '1.25rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{stats.onWhatsApp}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>✅ On WhatsApp</div>
          </div>
          <div
            onClick={() => setFilterTab('not_on_whatsapp')}
            style={{
              background: filterTab === 'not_on_whatsapp' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${filterTab === 'not_on_whatsapp' ? '#ef4444' : 'var(--border)'}`,
              borderRadius: '12px',
              padding: '1.25rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{stats.notOnWhatsApp + stats.invalid}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>❌ Not on WhatsApp</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {filteredResults.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Results ({filteredResults.length})
            </h3>
            <button
              onClick={exportCSV}
              style={{
                padding: '0.5rem 1rem',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              📥 Export CSV
            </button>
          </div>

          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    #
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Phone Number
                  </th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {result.number}
                    </td>
                    <td style={{ padding: '0.75rem 1.5rem' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: result.status === 'on_whatsapp' ? 'rgba(34, 197, 94, 0.15)' :
                          result.status === 'not_on_whatsapp' ? 'rgba(239, 68, 68, 0.15)' :
                          'rgba(234, 179, 8, 0.15)',
                        color: result.status === 'on_whatsapp' ? '#22c55e' :
                          result.status === 'not_on_whatsapp' ? '#ef4444' :
                          '#eab308',
                      }}>
                        {result.status === 'on_whatsapp' ? '✅ On WhatsApp' :
                         result.status === 'not_on_whatsapp' ? '❌ Not on WhatsApp' :
                         result.status === 'invalid' ? '⚠️ Invalid' :
                         `⚠️ ${result.reason}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
