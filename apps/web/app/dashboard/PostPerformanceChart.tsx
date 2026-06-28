'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { eachDayOfInterval, format, isSameDay, subDays } from 'date-fns'

interface Post {
  id: string
  scheduledFor: string
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'
}

interface ChartRow {
  date: string
  Scheduled: number
  Published: number
  Failed: number
}

interface Props {
  posts: Post[]
}

function buildChartData(posts: Post[]): ChartRow[] {
  const today = new Date()
  const days = eachDayOfInterval({ start: subDays(today, 29), end: today })

  return days.map((day) => {
    const dayPosts = posts.filter((p) => isSameDay(new Date(p.scheduledFor), day))
    return {
      date: format(day, 'MMM d'),
      Scheduled: dayPosts.filter((p) => p.status === 'SCHEDULED').length,
      Published: dayPosts.filter((p) => p.status === 'PUBLISHED').length,
      Failed:    dayPosts.filter((p) => p.status === 'FAILED').length,
    }
  })
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-sm space-y-1 min-w-[140px]">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        p.value > 0 && (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.color }} />
              <span className="text-muted-foreground">{p.name}</span>
            </div>
            <span className="font-medium">{p.value}</span>
          </div>
        )
      ))}
      {total > 0 && (
        <div className="flex justify-between border-t pt-1 mt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">{total}</span>
        </div>
      )}
    </div>
  )
}

export function PostPerformanceChart({ posts }: Props) {
  const data = buildChartData(posts)
  const hasAnyPosts = posts.length > 0

  // Only render every 5th tick label to avoid crowding 30-day x-axis
  const tickFormatter = (value: string, index: number) =>
    index % 5 === 0 ? value : ''

  if (!hasAnyPosts) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-muted/50 h-64">
        <p className="text-sm text-muted-foreground">
          No posts yet — schedule a post from the Calendar to see data here.
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barSize={8} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={tickFormatter}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={24}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
        <Legend
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
        />
        <Bar dataKey="Scheduled" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        <Bar dataKey="Published" fill="#22c55e" radius={[2, 2, 0, 0]} />
        <Bar dataKey="Failed"    fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
