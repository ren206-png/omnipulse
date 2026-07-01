'use client'
import { useState, useMemo } from 'react'

interface Hook { id: string; text: string; category: string }

const HOOKS: Hook[] = [
  { id: '1', text: 'Nobody talks about this, but…', category: 'Curiosity' },
  { id: '2', text: "I spent 3 years learning this so you don't have to.", category: 'Curiosity' },
  { id: '3', text: 'The thing about [X] that most people get wrong:', category: 'Curiosity' },
  { id: '4', text: 'Unpopular opinion: [X] is actually…', category: 'Curiosity' },
  { id: '5', text: "Two years ago I was struggling. Here's what changed:", category: 'Story' },
  { id: '6', text: 'I almost quit. Then this happened.', category: 'Story' },
  { id: '7', text: 'The day I realized [X] changed everything.', category: 'Story' },
  { id: '8', text: '5 things I wish I knew before [X]:', category: 'Value' },
  { id: '9', text: 'Stop doing [X]. Start doing [Y] instead.', category: 'Value' },
  { id: '10', text: 'A 60-second guide to [X]:', category: 'Value' },
  { id: '11', text: "After [N] years in [industry], here's my honest take:", category: 'Authority' },
  { id: '12', text: "I've worked with [N]+ clients. The #1 mistake I see:", category: 'Authority' },
  { id: '13', text: 'Hot take: [controversial opinion]. Fight me.', category: 'Engagement' },
  { id: '14', text: "What's one thing you wish you'd started sooner? Mine was…", category: 'Engagement' },
  { id: '15', text: 'This strategy is still underused in [year].', category: 'FOMO' },
  { id: '16', text: "Most people doing [X] are missing this one thing.", category: 'FOMO' },
  { id: '17', text: "If you're not doing [X] yet, you're leaving money on the table.", category: 'FOMO' },
  { id: '18', text: "Be honest: are you actually [doing the thing]?", category: 'Question' },
  { id: '19', text: "How many of these [X] mistakes are you making?", category: 'Question' },
  { id: '20', text: 'What would you do if you knew you could not fail?', category: 'Question' },
]

const CATEGORIES = ['All', 'Curiosity', 'Story', 'Value', 'Authority', 'Engagement', 'FOMO', 'Question']

export function HookLibrary({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [insertedId, setInsertedId] = useState<string | null>(null)

  const filtered = useMemo(() => HOOKS.filter((h) => {
    const matchesCategory = activeCategory === 'All' || h.category === activeCategory
    const matchesSearch = !search || h.text.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  }), [search, activeCategory])

  function handleInsert(hook: Hook) {
    onInsert(hook.text)
    setInsertedId(hook.id)
    setTimeout(() => { setInsertedId(null); onClose() }, 800)
  }

  return (
    <div className="rounded-xl border bg-background shadow-xl overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">🎣 Viral Hook Library</p>
          <p className="text-xs text-muted-foreground">Click any hook to insert at the start of your post</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      <div className="px-3 py-2 border-b">
        <input className="w-full h-8 text-xs border rounded-lg px-2.5 bg-background outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search hooks…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b">
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
            {cat}
          </button>
        ))}
      </div>
      <div className="max-h-60 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No hooks match your search.</p>
        ) : filtered.map((hook) => (
          <button key={hook.id} type="button" onClick={() => handleInsert(hook)}
            className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors group">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs leading-relaxed flex-1">{hook.text}</p>
              <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-all ${insertedId === hook.id ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground opacity-0 group-hover:opacity-100'}`}>
                {insertedId === hook.id ? '✓ Added' : 'Use'}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5 block">{hook.category}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
