'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: number
  user_id: string
  message: string
  created_at: string
  profiles: { display_name: string } | null
}

interface Props {
  myId: string
}

export default function ChatBox({ myId }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load initial messages
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('chat_messages')
        .select('id, user_id, message, created_at, profiles(display_name)')
        .order('created_at', { ascending: true })
        .limit(200)
      if (data) setMessages(data as Message[])
    }
    load()
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          // Fetch the full row including the joined display_name
          const { data } = await supabase
            .from('chat_messages')
            .select('id, user_id, message, created_at, profiles(display_name)')
            .eq('id', (payload.new as { id: number }).id)
            .single()
          if (data) setMessages(prev => [...prev, data as Message])
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as { id: number }).id))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const msg = text.trim()
    if (!msg || sending) return
    setSending(true)
    setText('')
    await supabase.from('chat_messages').insert({ user_id: myId, message: msg })
    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function deleteMessage(id: number) {
    await supabase.from('chat_messages').delete().eq('id', id)
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return time
    return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + ' ' + time
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 flex flex-col" style={{ height: '360px' }}>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2 shrink-0">
        Keskustelu
      </h2>

      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
        {messages.length === 0 && (
          <p className="text-xs text-gray-300 text-center pt-8">Ei viestejä vielä. Ole ensimmäinen!</p>
        )}
        {messages.map(m => {
          const isMe = m.user_id === myId
          const name = m.profiles?.display_name ?? '?'
          return (
            <div key={m.id} className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isMe && (
                  <span className="text-xs text-gray-400 font-medium px-1">{name}</span>
                )}
                <div className={`flex items-end gap-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`px-3 py-1.5 rounded-2xl text-sm leading-snug break-words ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.message}
                  </div>
                  <span className="text-xs text-gray-300 shrink-0 mb-0.5">{formatTime(m.created_at)}</span>
                  {isMe && (
                    <button
                      onClick={() => deleteMessage(m.id)}
                      className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity mb-0.5"
                      title="Poista"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            maxLength={500}
            placeholder="Kirjoita viesti…"
            className="flex-1 border border-gray-300 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center shrink-0 hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 translate-x-px">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
